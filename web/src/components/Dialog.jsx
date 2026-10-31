import { useEffect, useRef } from "react";
import { useLocale } from "../i18n/LocaleProvider.jsx";
export default function Dialog({ title, onClose, children }) {
  const ref = useRef();
  const { t } = useLocale();
  useEffect(() => {
    const focus = document.activeElement;
    ref.current.showModal();
    return () => {
      ref.current?.close();
      focus?.focus();
    };
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} aria-label={title}>
      <header className="dialog-head">
        <h2>{title}</h2>
        <button onClick={onClose} aria-label={t("close")}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
