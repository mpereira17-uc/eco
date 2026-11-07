//go:build windows

package main

// Eco.exe: abre el juego en una ventana nativa con WebView2 (incluido en Windows 10 y 11).
// Si WebView2 no está disponible, lo abre en el navegador predeterminado.

import (
	_ "embed"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
)

//go:embed icon-256.png
var icon256 []byte

//go:embed icon-32.png
var icon32 []byte

var (
	user32                       = syscall.NewLazyDLL("user32.dll")
	procMessageBoxW              = user32.NewProc("MessageBoxW")
	procSendMessageW             = user32.NewProc("SendMessageW")
	procCreateIconFromResourceEx = user32.NewProc("CreateIconFromResourceEx")
	procGetWindowLongPtrW        = user32.NewProc("GetWindowLongPtrW")
	procSetWindowLongPtrW        = user32.NewProc("SetWindowLongPtrW")
	procGetWindowPlacement       = user32.NewProc("GetWindowPlacement")
	procSetWindowPlacement       = user32.NewProc("SetWindowPlacement")
	procMonitorFromWindow        = user32.NewProc("MonitorFromWindow")
	procGetMonitorInfoW          = user32.NewProc("GetMonitorInfoW")
	procSetWindowPos             = user32.NewProc("SetWindowPos")
	procShowWindow               = user32.NewProc("ShowWindow")
)

const (
	wmSetIcon           = 0x0080
	iconSmall           = 0
	iconBig             = 1
	gwlStyle            = ^uintptr(15) // -16
	wsOverlappedWindow  = 0x00CF0000
	monitorDefaultNear  = 2
	swpNoSize           = 0x0001
	swpNoMove           = 0x0002
	swpNoZOrder         = 0x0004
	swpFrameChanged     = 0x0020
	swpNoOwnerZOrder    = 0x0200
	swMaximize          = 3
	mbOK                = 0x00000000
	mbIconInformation   = 0x00000040
	mbIconError         = 0x00000010
)

type rect struct{ Left, Top, Right, Bottom int32 }
type point struct{ X, Y int32 }

type monitorInfo struct {
	CbSize    uint32
	RcMonitor rect
	RcWork    rect
	DwFlags   uint32
}

type windowPlacement struct {
	Length           uint32
	Flags            uint32
	ShowCmd          uint32
	PtMinPosition    point
	PtMaxPosition    point
	RcNormalPosition rect
}

func messageBox(text, title string, flags uintptr) {
	t, _ := syscall.UTF16PtrFromString(text)
	c, _ := syscall.UTF16PtrFromString(title)
	procMessageBoxW.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), flags)
}

func iconFromPNG(png []byte, size int) uintptr {
	if len(png) == 0 {
		return 0
	}
	h, _, _ := procCreateIconFromResourceEx.Call(
		uintptr(unsafe.Pointer(&png[0])), uintptr(len(png)), 1, 0x00030000, uintptr(size), uintptr(size), 0)
	return h
}

// Pantalla completa sin bordes (F11) conmutando el estilo de la ventana.
type fullscreen struct {
	on        bool
	style     uintptr
	placement windowPlacement
}

func (f *fullscreen) toggle(hwnd uintptr) {
	if !f.on {
		f.style, _, _ = procGetWindowLongPtrW.Call(hwnd, gwlStyle)
		f.placement.Length = uint32(unsafe.Sizeof(f.placement))
		procGetWindowPlacement.Call(hwnd, uintptr(unsafe.Pointer(&f.placement)))
		mon, _, _ := procMonitorFromWindow.Call(hwnd, monitorDefaultNear)
		mi := monitorInfo{CbSize: uint32(unsafe.Sizeof(monitorInfo{}))}
		procGetMonitorInfoW.Call(mon, uintptr(unsafe.Pointer(&mi)))
		procSetWindowLongPtrW.Call(hwnd, gwlStyle, f.style&^wsOverlappedWindow)
		procSetWindowPos.Call(hwnd, 0,
			uintptr(mi.RcMonitor.Left), uintptr(mi.RcMonitor.Top),
			uintptr(mi.RcMonitor.Right-mi.RcMonitor.Left), uintptr(mi.RcMonitor.Bottom-mi.RcMonitor.Top),
			swpNoOwnerZOrder|swpFrameChanged)
		f.on = true
		return
	}
	procSetWindowLongPtrW.Call(hwnd, gwlStyle, f.style)
	procSetWindowPlacement.Call(hwnd, uintptr(unsafe.Pointer(&f.placement)))
	procSetWindowPos.Call(hwnd, 0, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoZOrder|swpNoOwnerZOrder|swpFrameChanged)
	f.on = false
}

func openInBrowser(url string) error {
	return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}

func main() {
	url, err := startServer()
	if err != nil {
		messageBox("No se pudo iniciar Eco:\n"+err.Error(), "Eco", mbOK|mbIconError)
		os.Exit(1)
	}

	dataDir := ""
	if base, err := os.UserConfigDir(); err == nil {
		dataDir = filepath.Join(base, "Eco", "WebView2")
		_ = os.MkdirAll(dataDir, 0o755)
	}

	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		DataPath:  dataDir,
		WindowOptions: webview2.WindowOptions{
			Title:  "Eco",
			Width:  1280,
			Height: 800,
			Center: true,
		},
	})
	if w == nil {
		// Sin WebView2: el juego se abre en el navegador y esta ventana mantiene vivo el servidor.
		if err := openInBrowser(url); err != nil {
			messageBox("No se pudo abrir el navegador. Abre esta dirección a mano:\n"+url, "Eco", mbOK|mbIconInformation)
		}
		messageBox("Eco se está ejecutando en tu navegador:\n"+url+"\n\nCierra este aviso cuando termines de jugar.", "Eco", mbOK|mbIconInformation)
		return
	}
	defer w.Destroy()

	hwnd := uintptr(w.Window())
	if big := iconFromPNG(icon256, 256); big != 0 {
		procSendMessageW.Call(hwnd, wmSetIcon, iconBig, big)
	}
	if small := iconFromPNG(icon32, 32); small != 0 {
		procSendMessageW.Call(hwnd, wmSetIcon, iconSmall, small)
	}
	procShowWindow.Call(hwnd, swMaximize)

	fs := &fullscreen{}
	_ = w.Bind("ecoToggleFullscreen", func() bool {
		fs.toggle(hwnd)
		return fs.on
	})
	_ = w.Bind("ecoQuit", func() {
		w.Terminate()
	})
	w.SetSize(960, 600, webview2.HintMin)
	w.Navigate(url)
	w.Run()
}
