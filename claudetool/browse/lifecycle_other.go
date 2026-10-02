//go:build !unix

package browse

import "os/exec"

type browserProcessGroup struct{}

func startBrowserProcessGroup() (*browserProcessGroup, error) { return nil, nil }
func configureBrowserCmd(*exec.Cmd, *browserProcessGroup)     {}
func (*browserProcessGroup) kill() error                      { return nil }
