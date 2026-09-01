import { useRef } from "react";
import { Link } from "react-router-dom";
import RecentHiddenGemCard from "./RecentHiddenGemCard";

const SCROLL_AMOUNT = 320;

function GemCarousel({ title, seeMoreTo, items, onItemClick, emptyText, loading = false }) {
    const trackRef = useRef(null);

    function scrollByAmount(amount) {
        trackRef.current?.scrollBy({ left: amount, behavior: "smooth" });
    }

    return (
        <section className="gem-carousel">
            <div className="gem-carousel-header">
                <h2>{title}</h2>
                {seeMoreTo && (
                    <Link to={seeMoreTo} className="gem-carousel-see-more">
                        See more →
                    </Link>
                )}
            </div>

            {loading ? (
                <div className="gem-carousel-track" aria-hidden="true">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div className="gem-carousel-item" key={i}>
                            <div className="skeleton-card">
                                <div className="skeleton-card-image skeleton-shimmer" />
                                <div className="skeleton-card-body">
                                    <div className="skeleton-line skeleton-shimmer skeleton-line--title" />
                                    <div className="skeleton-line skeleton-shimmer skeleton-line--short" />
                                    <div className="skeleton-line skeleton-shimmer skeleton-line--wide" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : !items || items.length === 0 ? (
                <p className="gem-carousel-empty">{emptyText || "Nothing here yet."}</p>
            ) : (
                <div className="gem-carousel-wrap">
                    <button
                        type="button"
                        className="gem-carousel-arrow gem-carousel-arrow-left"
                        onClick={() => scrollByAmount(-SCROLL_AMOUNT)}
                        aria-label="Scroll left"
                    >
                        ‹
                    </button>

                    <div className="gem-carousel-track" ref={trackRef}>
                        {items.map((item, index) => (
                            <div className="gem-carousel-item" key={item.id ?? index}>
                                <RecentHiddenGemCard post={item} onClick={() => onItemClick(item)} />
                            </div>
                        ))}
                    </div>

                    <button
                        type="button"
                        className="gem-carousel-arrow gem-carousel-arrow-right"
                        onClick={() => scrollByAmount(SCROLL_AMOUNT)}
                        aria-label="Scroll right"
                    >
                        ›
                    </button>
                </div>
            )}
        </section>
    );
}

export default GemCarousel;
