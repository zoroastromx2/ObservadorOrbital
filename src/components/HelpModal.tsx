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
      <div className="help-card glass" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div className="popover-header">
          <div>
            <span className="eyebrow">REFERENCE</span>
            <h2>Keyboard shortcuts</h2>
          </div>
          <button id="closeHelp" className="icon-button" type="button" aria-label="Close help" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="shortcut-list">
          <div>
            <span>Play or pause</span>
            <kbd>Space</kbd>
          </div>
          <div>
            <span>Return to live time</span>
            <kbd>N</kbd>
          </div>
          <div>
            <span>Follow selected satellite</span>
            <kbd>F</kbd>
          </div>
          <div>
            <span>Toggle orbit</span>
            <kbd>O</kbd>
          </div>
          <div>
            <span>Toggle labels</span>
            <kbd>L</kbd>
          </div>
          <div>
            <span>Open command palette</span>
            <kbd>Ctrl / ⌘ K</kbd>
          </div>
          <div>
            <span>Open this reference</span>
            <kbd>?</kbd>
          </div>
          <div>
            <span>Close a dialog</span>
            <kbd>Esc</kbd>
          </div>
        </div>

        <p className="help-note">Drag the globe to orbit. Scroll or pinch to zoom. Any key skips the opening flight.</p>
      </div>
    </div>
  );
};
