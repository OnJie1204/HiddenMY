/**
 * Shared loading spinner.
 *   size    "sm" | "md" | "lg"   (default "md")
 *   label   optional text shown beside/under the spinner
 *   inline  render horizontally (spinner + label on one line) for section loads
 *   className  extra class on the wrapper
 */
export default function Spinner({ size = "md", label, inline = false, className = "" }) {
    return (
        <div
            className={`app-spinner-wrap ${inline ? "app-spinner-wrap--inline" : ""} ${className}`.trim()}
            role="status"
            aria-live="polite"
        >
            <span className={`app-spinner app-spinner--${size}`} aria-hidden="true" />
            {label && <span className="app-spinner-label">{label}</span>}
            {!label && <span className="app-spinner-sr">Loading…</span>}
        </div>
    );
}
