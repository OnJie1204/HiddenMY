function RecentHiddenGemCard({
    post,
    onClick
}){
    return (
        <div 
        className="recent-card"
        onClick={onClick}
        >
            {
            post.cover_image &&
            <img
            src={post.cover_image}
            alt={post.title}
            className="recent-image"
            />
            }
            <div className="recent-content">
                <h3>💎 {post.title}</h3>
                <p className="recent-state">
                    📍 {post.state}
                </p>
                <p>{post.description}</p>
                <button>Explore</button>
            </div>
        </div>
    );
}
export default RecentHiddenGemCard;