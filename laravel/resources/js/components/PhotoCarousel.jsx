import { useEffect, useRef, useState } from "react";

/**
 * Sliding photo carousel used everywhere a Hidden Gem's photos are shown:
 * the detail page, the map side panel, and (compact) the list/grid cards.
 * The track slides with a CSS transform transition; left/right arrow keys
 * work when focused, and horizontal swipe works on touch.
 *
 * Props:
 *   images        [{ image_url }, ...]
 *   alt           base alt text
 *   onImageClick  (url, index) => void   — e.g. open a lightbox
 *   showThumbs    render the thumbnail strip (default true; ignored in compact)
 *   compact       card mode — small arrows, dots only, no counter/thumbs
 *   fill          make the carousel fill its parent's height instead of a fixed one
 *   className     extra class on the root
 */
export default function PhotoCarousel({
    images = [],
    alt = "",
    onImageClick,
    showThumbs = true,
    compact = false,
    fill = false,
    className = "",
}) {
    const [index, setIndex] = useState(0);
    const touchStartX = useRef(null);
    const count = images.length;

    useEffect(() => {
        setIndex(0);
    }, [images]);

    const rootClass = [
        "photo-carousel",
        compact ? "photo-carousel--compact" : "",
        fill ? "photo-carousel--fill" : "",
        className,
    ].filter(Boolean).join(" ");

    if (count === 0) {
        return (
            <div className={rootClass}>
                <div className="photo-carousel-viewport">
                    <div className="photo-carousel-empty">No Image</div>
                </div>
            </div>
        );
    }

    // Controls live inside cards that are themselves clickable links — never
    // let a nav/dot click bubble up and trigger the card's navigation.
    const stop = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const go = (e, next) => {
        stop(e);
        setIndex(((next % count) + count) % count);
    };

    const onTouchStart = (e) => {
        touchStartX.current = e.touches[0].clientX;
    };

    const onTouchEnd = (e) => {
        if (touchStartX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(dx) > 40) {
            setIndex((i) => (((i + (dx < 0 ? 1 : -1)) % count) + count) % count);
        }
        touchStartX.current = null;
    };

    return (
        <div className={rootClass}>
            <div
                className="photo-carousel-viewport"
                tabIndex={count > 1 ? 0 : undefined}
                onKeyDown={(e) => {
                    if (e.key === "ArrowLeft") go(e, index - 1);
                    if (e.key === "ArrowRight") go(e, index + 1);
                }}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
            >
                <div
                    className="photo-carousel-track"
                    style={{ transform: `translateX(-${index * 100}%)` }}
                >
                    {images.map((img, i) => (
                        <div className="photo-carousel-slide" key={img.image_url ?? i}>
                            <img
                                src={img.image_url}
                                alt={`${alt} — photo ${i + 1} of ${count}`}
                                loading={i === 0 ? "eager" : "lazy"}
                                draggable={false}
                                onClick={onImageClick ? (e) => { stop(e); onImageClick(img.image_url, i); } : undefined}
                                onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                                style={onImageClick ? { cursor: "zoom-in" } : undefined}
                            />
                        </div>
                    ))}
                </div>

                {count > 1 && (
                    <>
                        <button
                            type="button"
                            className="photo-carousel-nav photo-carousel-prev"
                            aria-label="Previous photo"
                            onClick={(e) => go(e, index - 1)}
                        >
                            &#8249;
                        </button>
                        <button
                            type="button"
                            className="photo-carousel-nav photo-carousel-next"
                            aria-label="Next photo"
                            onClick={(e) => go(e, index + 1)}
                        >
                            &#8250;
                        </button>
                        {!compact && (
                            <span className="photo-carousel-count">{index + 1} / {count}</span>
                        )}
                        <div className="photo-carousel-dots">
                            {images.map((_, i) => (
                                <button
                                    type="button"
                                    key={i}
                                    className={i === index ? "photo-carousel-dot is-active" : "photo-carousel-dot"}
                                    aria-label={`Go to photo ${i + 1}`}
                                    aria-current={i === index}
                                    onClick={(e) => { stop(e); setIndex(i); }}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>

            {showThumbs && !compact && count > 1 && (
                <div className="photo-carousel-thumbs">
                    {images.map((img, i) => (
                        <button
                            type="button"
                            key={img.image_url ?? i}
                            className={i === index ? "photo-carousel-thumb is-active" : "photo-carousel-thumb"}
                            onClick={(e) => { stop(e); setIndex(i); }}
                            aria-label={`View photo ${i + 1}`}
                            aria-current={i === index}
                        >
                            <img
                                src={img.image_url}
                                alt=""
                                loading="lazy"
                                onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                            />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
