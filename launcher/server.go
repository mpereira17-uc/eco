package main

// Servidor local que sirve el juego embebido en el ejecutable.
// Usa un puerto fijo para que el progreso guardado (localStorage) se conserve entre partidas.

import (
	"embed"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"path"
	"strings"
)

//go:embed all:game
var gameFiles embed.FS

var preferredPorts = []int{47823, 47824, 47825, 47826}

var mimeTypes = map[string]string{
	".html":  "text/html; charset=utf-8",
	".js":    "text/javascript; charset=utf-8",
	".css":   "text/css; charset=utf-8",
	".json":  "application/json",
	".png":   "image/png",
	".svg":   "image/svg+xml",
	".woff2": "font/woff2",
	".txt":   "text/plain; charset=utf-8",
	".md":    "text/markdown; charset=utf-8",
}

func gameHandler() http.Handler {
	sub, err := fs.Sub(gameFiles, "game")
	if err != nil {
		panic(err)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if p == "" || p == "." {
			p = "index.html"
		}
		data, err := fs.ReadFile(sub, p)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		ct, ok := mimeTypes[strings.ToLower(path.Ext(p))]
		if !ok {
			ct = "application/octet-stream"
		}
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		_, _ = w.Write(data)
	})
}

// startServer escucha solo en 127.0.0.1 y devuelve la URL del juego.
func startServer() (string, error) {
	var ln net.Listener
	var err error
	for _, port := range preferredPorts {
		ln, err = net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
		if err == nil {
			break
		}
	}
	if ln == nil {
		ln, err = net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			return "", err
		}
	}
	srv := &http.Server{Handler: gameHandler()}
	go func() { _ = srv.Serve(ln) }()
	port := ln.Addr().(*net.TCPAddr).Port
	return fmt.Sprintf("http://127.0.0.1:%d/", port), nil
}
