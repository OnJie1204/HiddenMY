import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createTravelPost } from "../features/travel/travelPostsApi";
import { getTripItineraries, getTripItinerary } from "../features/travel/tripItinerariesApi";
import TripStopsEditor, { appendStopsToFormData } from "../components/TripStopsEditor";
import Spinner from "../components/Spinner";

let seedSeq = 0;

export default function CreateTravelPost() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const preselectedTripId = searchParams.get("trip") || "";

    const coverInputRef = useRef(null);
    const galleryInputRef = useRef(null);

    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [itineraries, setItineraries] = useState([]);
    const [stops, setStops] = useState([]);

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
    }, []);

    // "Turn this trip into a post" — pre-fill the stop list from that trip.
    useEffect(() => {
        if (!preselectedTripId) return;

        getTripItinerary(preselectedTripId)
            .then((res) => {
                const rows = res.data?.data?.locations || [];
                const seeded = rows.map((row) =>
                    row.isHidden && row.location
                        ? {
                              key: `seed${seedSeq++}`,
                              kind: "gem",
                              location_id: row.location.id,
                              name: row.location.place_name,
                              caption: "",
                              source_itinerary_id: Number(preselectedTripId),
                          }
                        : {
                              key: `seed${seedSeq++}`,
                              kind: "osm",
                              osm_id: row.osm_id ?? null,
                              osm_name: row.osm_name || "Place",
                              name: row.osm_name || "Place",
                              latitude: row.latitude,
                              longitude: row.longitude,
                              caption: "",
                              source_itinerary_id: Number(preselectedTripId),
                          }
                );
                setStops((prev) => (prev.length ? prev : seeded));
            })
            .catch((err) => console.error("Error fetching itinerary:", err));
    }, [preselectedTripId]);

    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => setMessage(""), 3000);
            return () => clearTimeout(timer);
        }
    }, [message]);

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

            if (coverImage) {
                data.append("cover_image", coverImage);
            }

            galleryImages.forEach((image) => data.append("images[]", image));

            const response = await createTravelPost(data);
            navigate(`/travel-posts/${response.data.data.id}`, { replace: true });
        } catch (error) {
            setMessage(error.response?.data?.message || "Failed to publish your post.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="travel-post-form-page">
            {message && <div className="travel-post-snackbar">{message}</div>}

            <div className="travel-post-form-card">
                <div className="travel-post-form-header">
                    <h2>Write a Travel Post</h2>
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
                        Build the trip readers can copy. Pull in stops from your own itineraries,
                        add hidden gems or places by search, then reorder or caption them. This is
                        a snapshot — later edits to your itineraries won't change it.
                    </p>
                    <TripStopsEditor stops={stops} setStops={setStops} itineraries={itineraries} />

                    <label className="travel-post-form-label">Cover Image</label>
                    <div className="hidden-gem-upload-row">
                        <label className="travel-post-form-file-label">
                            Choose Cover Image
                            <input ref={coverInputRef} type="file" accept="image/*" hidden onChange={handleCoverChange} />
                        </label>
                        <span className="hidden-gem-file-status">
                            {coverImage ? coverImage.name : "No file selected"}
                        </span>
                    </div>

                    {coverPreview && (
                        <div className="hidden-gem-image-preview">
                            <div className="hidden-gem-preview-item">
                                <img src={coverPreview} alt="Cover preview" />
                                <button
                                    type="button"
                                    className="hidden-gem-remove-image-btn"
                                    onClick={() => {
                                        setCoverImage(null);
                                        setCoverPreview("");
                                        if (coverInputRef.current) coverInputRef.current.value = "";
                                    }}
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    )}

                    <label className="travel-post-form-label">Gallery Images</label>
                    <div className="hidden-gem-upload-row">
                        <label className="travel-post-form-file-label">
                            Choose Gallery Images
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
                            {galleryImages.length > 0 ? `${galleryImages.length} file(s) selected` : "No file selected"}
                        </span>
                    </div>

                    <div className="hidden-gem-image-preview">
                        {galleryPreview.map((img, index) => (
                            <div key={index} className="hidden-gem-preview-item">
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
                            <Spinner size="sm" inline label="Publishing…" className="btn-spinner" />
                        ) : (
                            "Publish Travel Post"
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
