function RecentHiddenGemCard({
    post,
    onClick
}){
    return (
        <div 
        className="recent-card"
        onClick={onClick}
        >
            {post.images?.[0]?.image_url && (
                <img src={`/storage/${post.images[0].image_url}`} alt={post.place_name} className="recent-image"/>
            )}
            <div className="recent-content">
                <h3>💎 {post.place_name}</h3>
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