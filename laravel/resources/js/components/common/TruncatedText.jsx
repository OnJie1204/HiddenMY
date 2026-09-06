import { useState } from "react";

function TruncatedText({ text, limit = 100 }) {
    const [expanded, setExpanded] = useState(false);

    if (!text) return null;

    const needsTruncation = text.length > limit;
    const display = expanded || !needsTruncation
        ? text
        : `${text.slice(0, limit).trimEnd()}...`;

    function toggle(e) {
        e.stopPropagation();
        setExpanded((v) => !v);
    }

    return (
        <>
            {display}
            {needsTruncation && (
                <span
                    className="truncated-text-toggle"
                    role="button"
                    tabIndex={0}
                    onClick={toggle}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggle(e);
                        }
                    }}
                >
                    {expanded ? " see less" : " see more"}
                </span>
            )}
        </>
    );
}

export default TruncatedText;
