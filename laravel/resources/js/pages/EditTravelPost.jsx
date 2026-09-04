import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getTravelPostDetail, updateTravelPost } from "../api/travelPosts";
import { getTripItineraries } from "../api/TripItinerary";
import TripStopsEditor, { appendStopsToFormData } from "../components/TripStopsEditor";
import Spinner from "../components/Spinner";

let editSeq = 0;

export default function EditTravelPost() {
    const { id } = useParams();
    const navigate = useNavigate();

    const coverInputRef = useRef(null);
    const galleryInputRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [itineraries, setItineraries] = useState([]);
    const [stops, setStops] = useState([]);

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
                setStops(
                    (post.stops || [])
                        .filter((s) => !s.removed)
                        .map((s) =>
                            s.kind === "gem"
                                ? {
                                      key: `e${editSeq++}`,
                                      kind: "gem",
                                      location_id: s.gem?.id,
                                      name: s.name,
                                      caption: s.caption || "",
                                  }
                                : {
                                      key: `e${editSeq++}`,
                                      kind: "osm",
                                      osm_name: s.name,
                                      name: s.name,
                                      latitude: s.latitude,
                                      longitude: s.longitude,
                                      caption: s.caption || "",
                                  }
                        )
                        .filter((s) => s.kind === "osm" || s.location_id)
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
            appendStopsToFormData(data, stops);

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
        return <Spinner size="lg" label="Loading travel post…" />;
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

                    <label className="travel-post-form-label">The Trip (optional)</label>
                    <p className="travel-post-form-hint">
                        This trip is a snapshot. Reorder, caption, add or remove stops here —
                        stops whose hidden gem has since been removed are dropped on save.
                    </p>
                    <TripStopsEditor stops={stops} setStops={setStops} itineraries={itineraries} />

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
                        {submitting ? (
                            <Spinner size="sm" inline label="Saving…" className="btn-spinner" />
                        ) : (
                            "Save Changes"
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
