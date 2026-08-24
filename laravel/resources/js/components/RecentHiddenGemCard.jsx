import GemImage from "./GemImage";
import TruncatedText from "./TruncatedText";

function RecentHiddenGemCard({
    post,
    onClick
}){
    return (
        <div className="recent-card" onClick={onClick}>
            <GemImage src={post.images?.[0]?.image_url} alt={post.place_name} className="recent-image" />
            <div className="recent-content">
                <h3>{post.place_name}</h3>
                <p className="recent-state">
                    {post.state}
                </p>
                <p><TruncatedText text={post.description} limit={100} /></p>
                <button onClick={(e) => { e.stopPropagation(); onClick(); }}>Explore</button>
            </div>
        </div>
    );
}
export default RecentHiddenGemCard;
