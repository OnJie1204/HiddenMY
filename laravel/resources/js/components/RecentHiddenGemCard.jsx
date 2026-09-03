import PhotoCarousel from "./PhotoCarousel";
import TruncatedText from "./TruncatedText";

function RecentHiddenGemCard({
    post,
    onClick
}){
    return (
        <div className={`recent-card${post.permanently_closed_at ? " gem-card-closed" : ""}`} onClick={onClick}>
            <div className="recent-image">
                <PhotoCarousel
                    images={post.images || []}
                    alt={post.place_name}
                    compact
                    fill
                    showThumbs={false}
                />
            </div>
            <div className="recent-content">
                <h3>{post.place_name}</h3>
                <p className="recent-state">
                    {post.state}
                </p>
                <p className="recent-description"><TruncatedText text={post.description} limit={100} /></p>
                <button onClick={(e) => { e.stopPropagation(); onClick(); }}>Explore</button>
            </div>
        </div>
    );
}
export default RecentHiddenGemCard;
