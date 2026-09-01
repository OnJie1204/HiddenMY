/**
 * Shimmering skeleton placeholders shaped like the Hidden Gem / Travel Post
 * cards, shown while a list is loading.
 *   count      how many skeleton cards (default 6)
 *   className  the grid wrapper class (default "hidden-gems-list")
 */
export default function LoadingCards({ count = 6, className = "hidden-gems-list" }) {
    return (
        <div className={className} aria-hidden="true">
            {Array.from({ length: count }).map((_, i) => (
                <div className="skeleton-card" key={i}>
                    <div className="skeleton-card-image skeleton-shimmer" />
                    <div className="skeleton-card-body">
                        <div className="skeleton-line skeleton-shimmer skeleton-line--title" />
                        <div className="skeleton-line skeleton-shimmer skeleton-line--short" />
                        <div className="skeleton-line skeleton-shimmer" />
                        <div className="skeleton-line skeleton-shimmer skeleton-line--wide" />
                    </div>
                </div>
            ))}
        </div>
    );
}
