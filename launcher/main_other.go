//go:build !windows

package main

// Versión para Linux/macOS: sirve el juego y muestra la dirección para abrirlo en el navegador.
// Se usa sobre todo para probar el servidor embebido.

import (
	"fmt"
	"os"
	"os/signal"
)

func main() {
	url, err := startServer()
	if err != nil {
		fmt.Fprintln(os.Stderr, "No se pudo iniciar Eco:", err)
		os.Exit(1)
	}
	fmt.Println("Eco está sonando en", url)
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	<-stop
}
