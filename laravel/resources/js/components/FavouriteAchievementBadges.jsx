import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SPECIAL_ACHIEVEMENT_METADATA } from "../constants/specialAchievements";

export default function FavouriteAchievementBadges({ favourites = [], className = "" }) {
    const [previewAchievement, setPreviewAchievement] = useState(null);
    const closeButtonRef = useRef(null);
    const triggerButtonRef = useRef(null);
    const titleId = useId();
    const achievements = [...favourites]
        .sort((first, second) => first.position - second.position)
        .map((favourite) => ({
            key: favourite.key,
            ...SPECIAL_ACHIEVEMENT_METADATA[favourite.key],
        }))
        .filter((achievement) => achievement.title && achievement.artwork)
        .slice(0, 2);

    useEffect(() => {
        if (!previewAchievement) return undefined;

        closeButtonRef.current?.focus();

        const closeOnEscape = (event) => {
            if (event.key === "Escape") {
                closePreview();
            }
        };

        document.addEventListener("keydown", closeOnEscape);
        return () => document.removeEventListener("keydown", closeOnEscape);
    }, [previewAchievement]);

    const openPreview = (event, achievement) => {
        event.stopPropagation();
        triggerButtonRef.current = event.currentTarget;
        setPreviewAchievement(achievement);
    };

    const closePreview = () => {
        setPreviewAchievement(null);
        window.requestAnimationFrame(() => triggerButtonRef.current?.focus());
    };

    if (achievements.length === 0) return null;

    return (
        <>
            <span className={`favourite-achievement-badges ${className}`.trim()}>
                {achievements.map((achievement) => (
                    <button
                        key={achievement.key}
                        type="button"
                        className="favourite-achievement-badge"
                        title={achievement.title}
                        aria-label={`Preview favourite achievement: ${achievement.title}`}
                        onClick={(event) => openPreview(event, achievement)}
                    >
                        <img src={achievement.artwork} alt="" />
                    </button>
                ))}
            </span>

            {previewAchievement && createPortal(
                <div
                    className="favourite-achievement-preview-backdrop"
                    onClick={(event) => {
                        event.stopPropagation();
                        if (event.target === event.currentTarget) closePreview();
                    }}
                >
                    <div
                        className="favourite-achievement-preview"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            ref={closeButtonRef}
                            type="button"
                            className="favourite-achievement-preview-close"
                            aria-label="Close favourite achievement preview"
                            onClick={closePreview}
                        >
                            &times;
                        </button>
                        <img
                            src={previewAchievement.artwork}
                            alt=""
                            className="favourite-achievement-preview-artwork"
                        />
                        <h2 id={titleId}>{previewAchievement.title}</h2>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
