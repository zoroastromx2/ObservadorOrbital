import React from "react";

interface HelpModalProps {
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  return (
    <div
      id="helpOverlay"
      className="modal-layer help-layer"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="help-card glass" role="dialog" aria-modal="true" aria-label="Atajos de teclado">
        <div className="popover-header">
          <div>
            <span className="eyebrow">REFERENCIA</span>
            <h2>Atajos de teclado</h2>
          </div>
          <button id="closeHelp" className="icon-button" type="button" aria-label="Cerrar ayuda" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="shortcut-list">
          <div>
            <span>Reproducir o pausar</span>
            <kbd>Espacio</kbd>
          </div>
          <div>
            <span>Volver al tiempo real</span>
            <kbd>N</kbd>
          </div>
          <div>
            <span>Seguir satélite seleccionado</span>
            <kbd>F</kbd>
          </div>
          <div>
            <span>Alternar órbita</span>
            <kbd>O</kbd>
          </div>
          <div>
            <span>Alternar etiquetas</span>
            <kbd>L</kbd>
          </div>
          <div>
            <span>Abrir paleta de comandos</span>
            <kbd>Ctrl / ⌘ K</kbd>
          </div>
          <div>
            <span>Abrir esta guía de ayuda</span>
            <kbd>?</kbd>
          </div>
          <div>
            <span>Cerrar ventana o diálogo</span>
            <kbd>Esc</kbd>
          </div>
        </div>

        <p className="help-note">Arrastra el globo para rotar. Usa la rueda o pellizca para hacer zoom. Cualquier tecla omite la animación inicial.</p>
      </div>
    </div>
  );
};
