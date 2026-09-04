import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getTravelPosts, getMyTravelPosts } from "../api/travelPosts";
import { getCategories, getStates } from "../api/hiddenGems";
import Avatar from "../components/Avatar";
import LoadingCards from "../components/LoadingCards";
import FavouriteAchievementBadges from "../components/FavouriteAchievementBadges";
import SignInPrompt from "../components/SignInPrompt";

import "../styles/global.css";

function formatPostDate(dateString) {
    return new Date(dateString).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

export default function TravelPosts({ user }) {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [categories, setCategories] = useState([]);
    const [states, setStates] = useState([]);
    const [mineOnly, setMineOnly] = useState(searchParams.get("mine") === "1");
    const [showSignIn, setShowSignIn] = useState(false);
    const [signInMessage, setSignInMessage] = useState("");

    const requireSignIn = (message) => {
        setSignInMessage(message);
        setShowSignIn(true);
    };

    const handleCreatePost = () => {
        if (!user) {
            requireSignIn("Login to write a travel post.");
            return;
        }
        navigate("/travel-posts/create");
    };

    const filters = {
        state: searchParams.get("state") || "",
        category: searchParams.get("category") || "",
    };

    useEffect(() => {
        Promise.all([getCategories(), getStates()])
            .then(([categoryRes, stateRes]) => {
                setCategories(categoryRes.data.data || []);
                setStates(stateRes.data.data || []);
            })
            .catch((err) => console.error("Error fetching filters:", err));
    }, []);

    const fetchPosts = async () => {
        setLoading(true);
        setError("");

        try {
            const response = mineOnly
                ? await getMyTravelPosts()
                : await getTravelPosts(filters);

            setPosts(response.data.data || []);
        } catch (err) {
            console.error("Error fetching travel posts:", err);
            setError(err.response?.data?.message || "Failed to load travel posts.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPosts();
    }, [mineOnly, filters.state, filters.category]);

    const updateFilter = (name, value) => {
        const nextParams = new URLSearchParams(searchParams);
        if (value) {
            nextParams.set(name, value);
        } else {
            nextParams.delete(name);
        }
        setSearchParams(nextParams, { replace: true });
    };

    return (
        <div className="hidden-gems-page">
            <div className="hidden-gems-header">
                <div>
                    <h1>Travel Posts</h1>
                </div>
                <button className="hidden-gems-submit-btn" onClick={handleCreatePost}>
                    + Write a Post
                </button>
            </div>

            <div className="my-hidden-gems-tabs">
                <button
                    type="button"
                    className={!mineOnly ? "active" : ""}
                    onClick={() => {
                        setMineOnly(false);
                        searchParams.delete("mine");
                        setSearchParams(searchParams, { replace: true });
                    }}
                >
                    All Posts
                </button>
                <button
                    type="button"
                    className={mineOnly ? "active" : ""}
                    onClick={() => {
                        if (!user) {
                            requireSignIn("Login to see the posts you've written.");
                            return;
                        }
                        setMineOnly(true);
                        searchParams.set("mine", "1");
                        setSearchParams(searchParams, { replace: true });
                    }}
                >
                    My Posts
                </button>
            </div>

            {!mineOnly && (
                <div className="hidden-gems-filters">
                    <select
                        className="hidden-gems-filter-select"
                        value={filters.category}
                        onChange={(e) => updateFilter("category", e.target.value)}
                    >
                        <option value="">All Categories</option>
                        {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                                {category.name}
                            </option>
                        ))}
                    </select>

                    <select
                        className="hidden-gems-filter-select"
                        value={filters.state}
                        onChange={(e) => updateFilter("state", e.target.value)}
                    >
                        <option value="">All States</option>
                        {states.map((state) => (
                            <option key={state} value={state}>
                                {state}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {loading ? (
                <LoadingCards count={6} />
            ) : error ? (
                <div className="hidden-gems-empty">
                    <p>{error}</p>
                </div>
            ) : posts.length === 0 ? (
                <div className="hidden-gems-empty">
                    <h2>No Travel Posts Yet</h2>
                    <p>
                        {mineOnly
                            ? "You haven't written a travel post yet."
                            : "No one has shared a travel story yet — be the first!"}
                    </p>
                    <button className="hidden-gems-submit-btn" onClick={handleCreatePost}>
                        Write a Travel Post
                    </button>
                </div>
            ) : (
                <div className="hidden-gems-list">
                    {posts.map((post) => (
                        <div
                            className="travel-post-card"
                            key={post.id}
                            onClick={() => navigate(`/travel-posts/${post.id}`)}
                        >
                            <div className="travel-post-card-image">
                                {post.cover_image_url || post.images?.[0]?.image_url ? (
                                    <img
                                        src={post.cover_image_url || post.images[0].image_url}
                                        alt={post.title}
                                    />
                                ) : (
                                    <div className="hidden-gems-card-no-image">No Image</div>
                                )}
                            </div>

                            <div className="travel-post-card-content">
                                <div className="travel-post-card-byline">
                                    <Avatar name={post.user?.name} avatarUrl={post.user?.avatar_url} size="sm" />
                                    <div className="travel-post-card-byline-info">
                                        <div className="travel-post-author-identity">
                                            <span className="travel-post-card-author">
                                                {post.user?.name || "Traveler"}
                                            </span>
                                            <FavouriteAchievementBadges
                                                favourites={post.user?.favourite_achievements}
                                            />
                                        </div>
                                        <span className="travel-post-card-date">
                                            {formatPostDate(post.created_at)}
                                        </span>
                                    </div>
                                </div>

                                <h2 className="travel-post-card-title">{post.title}</h2>

                                <p className="travel-post-card-excerpt">
                                    {post.body?.length > 140 ? `${post.body.slice(0, 140)}…` : post.body}
                                </p>

                                {post.locations?.length > 0 && (
                                    <span className="travel-post-gem-pill">
                                        📍 {post.locations.length} gem{post.locations.length > 1 ? "s" : ""} tagged
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <SignInPrompt
                isOpen={showSignIn}
                onClose={() => setShowSignIn(false)}
                message={signInMessage}
            />
        </div>
    );
}
