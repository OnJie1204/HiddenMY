import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getTravelPostDetail, updateTravelPost } from "../api/travelPosts";
import { getTripItineraries } from "../api/TripItinerary";
import SearchBar from "../components/SearchBar";

export default function EditTravelPost() {
    const { id } = useParams();
    const navigate = useNavigate();

    const coverInputRef = useRef(null);
    const galleryInputRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [tripItineraryId, setTripItineraryId] = useState("");
    const [itineraries, setItineraries] = useState([]);
    const [taggedLocations, setTaggedLocations] = useState([]); // [{ id, place_name, caption }]

    const [existingImages, setExistingImages] = useState([]); // [{ id, image_url }]
    const [removedImageIds, setRemovedImageIds] = useState([]);
    const [existingCoverUrl, setExistingCoverUrl] = useState("");

    const [coverImage, setCoverImage] = useState(null);
    const [coverPreview, setCoverPreview] = useState("");
    const [galleryImages, setGalleryImages] = useState([]);
    const [galleryPreview, setGalleryPreview] = useState([]);

    const [message, setMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        getTripItineraries()
            .then((res) => setItineraries(res.data || []))
            .catch((err) => console.error("Error fetching itineraries:", err));

        getTravelPostDetail(id)
            .then((res) => {
                const post = res.data.data;
                setTitle(post.title);
                setBody(post.body);
                setTripItineraryId(post.trip_itinerary_id || "");
                setTaggedLocations(
                    (post.locations || []).map((location) => ({
                        id: location.id,
                        place_name: location.place_name,
                        caption: location.pivot?.caption || "",
                    }))
                );
                setExistingImages(post.images || []);
                setExistingCoverUrl(post.cover_image_url || "");
            })
            .catch((err) => {
                console.error("Error fetching travel post:", err);
                setMessage(err.response?.data?.message || "Failed to load this travel post.");
            })
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => setMessage(""), 3000);
            return () => clearTimeout(timer);
        }
    }, [message]);

    function handleSelectLocation(item) {
        if (item.source !== "database") {
            setMessage("Only saved hidden gems can be tagged in a post.");
            return;
        }

        setTaggedLocations((prev) =>
            prev.some((l) => l.id === item.id)
                ? prev
                : [...prev, { id: item.id, place_name: item.name, caption: "" }]
        );
    }

    function removeTaggedLocation(locationId) {
        setTaggedLocations((prev) => prev.filter((l) => l.id !== locationId));
    }

    function updateCaption(locationId, caption) {
        setTaggedLocations((prev) =>
            prev.map((l) => (l.id === locationId ? { ...l, caption } : l))
        );
    }

    function removeExistingImage(imageId) {
        setExistingImages((prev) => prev.filter((img) => img.id !== imageId));
        setRemovedImageIds((prev) => [...prev, imageId]);
    }

    function handleCoverChange(e) {
        const file = e.target.files[0];
        if (!file) return;
        setCoverImage(file);
        setCoverPreview(URL.createObjectURL(file));
    }

    function handleGalleryChange(e) {
        const files = Array.from(e.target.files);
        setGalleryImages((prev) => [...prev, ...files]);
        setGalleryPreview((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
    }

    function removeGalleryImage(index) {
        setGalleryImages((prev) => prev.filter((_, i) => i !== index));
        setGalleryPreview((prev) => prev.filter((_, i) => i !== index));
    }

    async function handleSubmit(e) {
        e.preventDefault();

        if (!title.trim() || !body.trim()) {
            setMessage("Title and story are required.");
            return;
        }

        setSubmitting(true);

        try {
            const data = new FormData();
            data.append("title", title);
            data.append("body", body);

            if (tripItineraryId) {
                data.append("trip_itinerary_id", tripItineraryId);
            }

            taggedLocations.forEach((location) => {
                data.append("location_ids[]", location.id);
                data.append("captions[]", location.caption || "");
            });

            removedImageIds.forEach((imageId) => data.append("remove_image_ids[]", imageId));

            if (coverImage) {
                data.append("cover_image", coverImage);
            }

            galleryImages.forEach((image) => data.append("images[]", image));

            await updateTravelPost(id, data);

            navigate(`/travel-posts/${id}`);
        } catch (error) {
            setMessage(error.response?.data?.message || "Failed to update your post.");
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return (
            <div className="hidden-gems-loading">
                <p>Loading travel post...</p>
            </div>
        );
    }

    return (
        <div className="travel-post-form-page">
            {message && <div className="travel-post-snackbar">{message}</div>}

            <div className="travel-post-form-card">
                <div className="travel-post-form-header">
                    <h2>Edit Travel Post</h2>
                </div>

                <form onSubmit={handleSubmit}>
                    <label className="travel-post-form-label">Title</label>
                    <input
                        className="form-input travel-post-title-input"
                        placeholder="Give your story a title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />

                    <label className="travel-post-form-label">Your Story</label>
                    <textarea
                        className="form-input travel-post-body-input"
                        placeholder="Tell the story of your trip…"
                        rows={8}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                    />

                    <label className="travel-post-form-label">Link to a Trip (optional)</label>
                    <select
                        className="form-input"
                        value={tripItineraryId}
                        onChange={(e) => setTripItineraryId(e.target.value)}
                    >
                        <option value="">Not linked to a trip</option>
                        {itineraries.map((trip) => (
                            <option key={trip.id} value={trip.id}>
                                {trip.trip_name}
                            </option>
                        ))}
                    </select>

                    <label className="travel-post-form-label">Tag Hidden Gems</label>
                    <SearchBar onSelect={handleSelectLocation} />

                    {taggedLocations.length > 0 && (
                        <div className="travel-post-tag-list">
                            {taggedLocations.map((location) => (
                                <div key={location.id} className="travel-post-tag-item">
                                    <span className="travel-post-tag-name">{location.place_name}</span>
                                    <input
                                        className="form-input"
                                        placeholder="Caption (optional)"
                                        value={location.caption}
                                        onChange={(e) => updateCaption(location.id, e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        className="travel-post-tag-remove-btn"
                                        title="Remove"
                                        onClick={() => removeTaggedLocation(location.id)}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <label className="travel-post-form-label">Cover Image</label>
                    <div className="hidden-gem-upload-row">
                        <label className="travel-post-form-file-label">
                            Replace Cover Image
                            <input ref={coverInputRef} type="file" accept="image/*" hidden onChange={handleCoverChange} />
                        </label>
                        <span className="hidden-gem-file-status">
                            {coverImage ? coverImage.name : "No new file selected"}
                        </span>
                    </div>

                    <div className="hidden-gem-image-preview">
                        {coverPreview ? (
                            <div className="hidden-gem-preview-item">
                                <img src={coverPreview} alt="New cover preview" />
                            </div>
                        ) : existingCoverUrl ? (
                            <div className="hidden-gem-preview-item">
                                <img src={existingCoverUrl} alt="Current cover" />
                            </div>
                        ) : null}
                    </div>

                    <label className="travel-post-form-label">Gallery Images</label>
                    <div className="hidden-gem-upload-row">
                        <label className="travel-post-form-file-label">
                            Add Gallery Images
                            <input
                                ref={galleryInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                hidden
                                onChange={handleGalleryChange}
                            />
                        </label>
                        <span className="hidden-gem-file-status">
                            {galleryImages.length > 0 ? `${galleryImages.length} new file(s) selected` : "No new file selected"}
                        </span>
                    </div>

                    <div className="hidden-gem-image-preview">
                        {existingImages.map((image) => (
                            <div key={image.id} className="hidden-gem-preview-item">
                                <img src={image.image_url} alt="" />
                                <button
                                    type="button"
                                    className="hidden-gem-remove-image-btn"
                                    onClick={() => removeExistingImage(image.id)}
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                        {galleryPreview.map((img, index) => (
                            <div key={`new-${index}`} className="hidden-gem-preview-item">
                                <img src={img} alt={`preview-${index}`} />
                                <button
                                    type="button"
                                    className="hidden-gem-remove-image-btn"
                                    onClick={() => removeGalleryImage(index)}
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>

                    <button type="submit" className="travel-post-submit-btn" disabled={submitting}>
                        {submitting ? "Saving…" : "Save Changes"}
                    </button>
                </form>
            </div>
        </div>
    );
}
