function RecentHiddenGemCard({
    post,
    onClick
}){
    return (
        <div 
        className="recent-card"
        onClick={onClick}
        >
<<<<<<< HEAD
            {post.images?.[0]?.image_url && (
                <img src={`/storage/${post.images[0].image_url}`} alt={post.place_name} className="recent-image"/>
            )}
            <div className="recent-content">
                <h3>💎 {post.place_name}</h3>
=======
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
>>>>>>> Interactive-Map
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