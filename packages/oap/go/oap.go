package oap

// Manifest is the Open Agent Protocol handshake. Workers cannot certify.
type Manifest struct {
	Name           string   `json:"name"`
	Version        string   `json:"version"`
	Capabilities   []string `json:"capabilities"`
	CannotCertify  bool     `json:"cannotCertify"`
	Languages      []string `json:"languages,omitempty"`
}
