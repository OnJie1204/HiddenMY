import LocationPickerMap from "../components/LocationPickerMap";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    getHiddenGemDetail,
    getCategories,
    updateHiddenGem,
    geocodeAddress
} from "../api/hiddenGems";

import "../styles/global.css";

function locationFields(data) {
    return {
        address: String(data.address ?? "").trim(),
        state: String(data.state ?? "").trim(),
        postcode: String(data.postcode ?? "").trim(),
    };
}

export default function EditHiddenGem() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        category_id: "",
        place_name: "",
        address: "",
        state: "",
        postcode: "",
        description: "",
        opening_hours: "",
        phone: "",
        website: "",
        latitude: "",
        longitude: "",
    });

    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [message, setMessage] = useState("");
    const [messageType, setMessageType] = useState("");
    const [editUnavailableMessage, setEditUnavailableMessage] = useState("");

    const [postcodeDetectionFailed, setPostcodeDetectionFailed] = useState(false);
    const [existingImages, setExistingImages] = useState([]);
    const [newImages, setNewImages] = useState([]);

    const coordinateLocationRef = useRef(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [gemRes, categoryRes] = await Promise.all([
                    getHiddenGemDetail(id),
                    getCategories()
                ]);

                const gem = gemRes.data.data;

                // Extra frontend protection
                const editableStatuses = ["pending", "ai_rejected", "pending_community_vote"];
                if (Number(gem.vote_count) > 0) {
                    setEditUnavailableMessage(
                        "This Hidden Gem can no longer be edited because voting has started."
                    );
                    return;
                }

                if (!editableStatuses.includes(gem.status)) {
                    setEditUnavailableMessage(
                        gem.status === "hidden_gem"
                            ? "Verified Hidden Gems can no longer be edited."
                            : "This Hidden Gem can no longer be edited."
                    );
                    return;
                }

                const loadedFormData = {
                    category_id: gem.category_id || "",
                    place_name: gem.place_name || "",
                    address: gem.address || "",
                    state: gem.state || "",
                    postcode: gem.postcode || "",
                    description: gem.description || "",
                    opening_hours: gem.opening_hours || "",
                    phone: gem.phone || "",
                    website: gem.website || "",
                    latitude: gem.latitude || "",
                    longitude: gem.longitude || "",
                };

                setFormData(loadedFormData);
                setExistingImages(gem.images || []);

                coordinateLocationRef.current = {
                    source: "loaded",
                    fields: locationFields(loadedFormData),
                    missing: {
                        address: false,
                        state: false,
                        postcode: false,
                    },
                    latitude: String(loadedFormData.latitude),
                    longitude: String(loadedFormData.longitude),
                };

                setCategories(categoryRes.data.data || []);

            } catch (error) {
                console.error("Failed to load hidden gem:", error);

                setMessageType("error");
                setMessage(
                    error.response?.data?.message ||
                    "Failed to load hidden gem."
                );
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [id, navigate]);

    useEffect(() => {
        if (!message) return;

        const timer = setTimeout(() => {
            setMessage("");
            setMessageType("");
        }, 3000);

        return () => clearTimeout(timer);
    }, [message]);

    const handleChange = (e) => {
        setFormData((prev) => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        setSaving(true);
        setMessage("");
        setMessageType("");

        try {
            let dataToSave = { ...formData };

            const currentLocation = locationFields(formData);
            const coordinateLocation = coordinateLocationRef.current;

                const locationChanged = !coordinateLocation
                    || ["address", "state", "postcode"].some((field) => {
                        if (
                            coordinateLocation.source === "map"
                            && coordinateLocation.missing[field]
                        ) {
                            return false;
                        }

                        return (
                            currentLocation[field]
                            !== coordinateLocation.fields[field]
                        );
                    });

                if (locationChanged) {
                    const normalizedAddress = currentLocation.address.toLowerCase();
                    const normalizedState = currentLocation.state.toLowerCase();

                    if (
                        normalizedAddress === normalizedState
                        || normalizedAddress === "malaysia"
                        || normalizedAddress === `${normalizedState}, malaysia`
                        || normalizedAddress === `${normalizedState} malaysia`
                    ) {
                        setMessageType("error");
                        setMessage(
                            "Unable to identify this location. Please check the address."
                        );
                        return;
                    }

                    const query = [
                        currentLocation.address,
                        currentLocation.state,
                        currentLocation.postcode,
                        "Malaysia"
                    ]
                        .filter((part) => part !== "")
                        .join(", ");

                    try {
                        const geocodeResponse = await geocodeAddress(query);
                        const countryCode = String(
                            geocodeResponse.data.country_code ?? ""
                        ).trim().toLowerCase();

                        if (
                            countryCode !== "my"
                            || geocodeResponse.data.is_specific !== true
                        ) {
                            setMessageType("error");
                            setMessage(
                                "Unable to identify this location. Please check the address."
                            );
                            return;
                        }

                        const latitude = String(
                            geocodeResponse.data.latitude
                        );

                        const longitude = String(
                            geocodeResponse.data.longitude
                        );

                        dataToSave = {
                            ...dataToSave,
                            latitude,
                            longitude,
                        };

                        setFormData((prev) => ({
                            ...prev,
                            latitude,
                            longitude,
                        }));

                        coordinateLocationRef.current = {
                            source: "loaded",
                            fields: currentLocation,
                            missing: {
                                address: false,
                                state: false,
                                postcode: false,
                            },
                            latitude,
                            longitude,
                        };

                    } catch (error) {
                        setMessageType("error");
                        setMessage(
                            "Unable to identify this location. Please check the address."
                        );
                        return;
                    }
                }

            let updateData = dataToSave;

            if (newImages.length > 0) {
                updateData = new FormData();

                Object.entries(dataToSave).forEach(([key, value]) => {
                    updateData.append(key, value);
                });

                newImages.forEach(({ file }) => {
                    updateData.append("images[]", file);
                });
            }

            const response = await updateHiddenGem(id, updateData);

            setMessageType("success");
            setMessage(response.data.message);

            setTimeout(() => {
                navigate("/my-hidden-gems");
            }, 1200);

        } catch (error) {
            console.error("Update failed:", error);

            setMessageType("error");
            setMessage(
                error.response?.data?.message ||
                "Failed to update hidden gem."
            );

        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="hidden-gems-loading">
                <p>Loading hidden gem...</p>
            </div>
        );
    }

    return (
        <div className="hidden-gem-form-page">

            {message && (
                <div
                    className={`hidden-gem-snackbar ${
                        messageType === "error"
                            ? "hidden-gem-snackbar-error"
                            : "hidden-gem-snackbar-success"
                    }`}
                >
                    {message}
                </div>
            )}

            <div className="hidden-gem-form-card">

                <div className="hidden-gem-submit-header">
                    <h2>Edit Hidden Gem</h2>
                </div>

                {editUnavailableMessage ? (
                    <div className="hidden-gems-empty">
                        <h3>Editing Unavailable</h3>
                        <p>{editUnavailableMessage}</p>
                        <button
                            type="button"
                            className="hidden-gem-submit-btn"
                            onClick={() => navigate("/my-hidden-gems")}
                        >
                            Back to My Hidden Gems
                        </button>
                    </div>
                ) : (
                <form className="edit-hidden-gem-form" onSubmit={handleSubmit}>

                    <input
                        className="form-input"
                        name="place_name"
                        placeholder="Place Name"
                        value={formData.place_name}
                        onChange={handleChange}
                        required
                    />

                    <input
                        className="form-input"
                        name="address"
                        placeholder="Address"
                        value={formData.address}
                        onChange={handleChange}
                        required
                    />

                    <select
                        className="form-input"
                        name="state"
                        value={formData.state}
                        onChange={handleChange}
                        required
                    >
                        <option value="">Select State</option>
                        <option value="Johor">Johor</option>
                        <option value="Kuala Lumpur">Kuala Lumpur</option>
                        <option value="Penang">Penang</option>
                        <option value="Selangor">Selangor</option>
                        <option value="Melaka">Melaka</option>
                        <option value="Perak">Perak</option>
                        <option value="Pahang">Pahang</option>
                        <option value="Sarawak">Sarawak</option>
                        <option value="Sabah">Sabah</option>
                        <option value="Terengganu">Terengganu</option>
                        <option value="Kelantan">Kelantan</option>
                        <option value="Kedah">Kedah</option>
                        <option value="Negeri Sembilan">Negeri Sembilan</option>
                        <option value="Perlis">Perlis</option>
                        <option value="Putrajaya">Putrajaya</option>
                        <option value="Labuan">Labuan</option>
                    </select>

                    <input
                        className="form-input"
                        name="postcode"
                        placeholder="Postcode"
                        value={formData.postcode}
                        onChange={handleChange}
                        required
                    />

                    {postcodeDetectionFailed
                        && (
                            !formData.address
                            || !formData.state
                            || !formData.postcode
                        ) && (
                            <small className="edit-hidden-gem-warning">
                                Some address details could not be detected
                                automatically. Please complete the missing
                                fields manually.
                            </small>
                        )}

                    <LocationPickerMap
                        latitude={formData.latitude}
                        longitude={formData.longitude}
                        onLocationSelected={(location) => {
                            const postcode =
                                String(location.postcode ?? "").trim()
                                || String(location.address ?? "")
                                    .match(/\b\d{5}\b/)?.[0]
                                || "";

                            const address = String(
                                location.address ?? ""
                            ).trim();

                            const state = String(
                                location.state ?? ""
                            ).trim();

                            setPostcodeDetectionFailed(
                                !address || !state || !postcode
                            );

                            setFormData((prev) => {
                                const updatedFormData = {
                                    ...prev,
                                    address,
                                    state,
                                    postcode,
                                    latitude: String(location.latitude),
                                    longitude: String(location.longitude),
                                };

                                coordinateLocationRef.current = {
                                    source: "map",
                                    fields: locationFields(updatedFormData),
                                    missing: {
                                        address: !address,
                                        state: !state,
                                        postcode: !postcode,
                                    },
                                    latitude: String(location.latitude),
                                    longitude: String(location.longitude),
                                };

                                return updatedFormData;
                            });
                        }}
                    />

                    <textarea
                        className="form-input hidden-gem-description"
                        name="description"
                        placeholder="Description"
                        value={formData.description}
                        onChange={handleChange}
                        required
                    />

                    <p className="hidden-gem-optional-hint">
                        Optional — fill in anything you know. Since you're not necessarily the owner, it's fine to leave these blank.
                    </p>
                    <input
                        className="form-input"
                        name="opening_hours"
                        placeholder="Opening hours (e.g. Tue–Sun 8am–2pm)"
                        value={formData.opening_hours}
                        onChange={handleChange}
                    />
                    <input
                        className="form-input"
                        name="phone"
                        placeholder="Phone / WhatsApp number"
                        value={formData.phone}
                        onChange={handleChange}
                    />
                    <input
                        className="form-input"
                        name="website"
                        placeholder="Website or social media link"
                        value={formData.website}
                        onChange={handleChange}
                    />

                    <select
                        className="form-input"
                        name="category_id"
                        value={formData.category_id}
                        onChange={handleChange}
                        required
                    >
                        <option value="">Select Category</option>

                        {categories.map((category) => (
                            <option
                                key={category.id}
                                value={category.id}
                            >
                                {category.name}
                            </option>
                        ))}
                    </select>

                    <div className="edit-hidden-gem-images-section">
                        <h4>Existing Images</h4>
                        <p className="edit-hidden-gem-images-note">
                            Existing images cannot be edited or removed.
                        </p>

                        {existingImages.length > 0 ? (
                            <div className="hidden-gem-image-preview">
                                {existingImages.map((image) => (
                                    <div key={image.id} className="hidden-gem-preview-item">
                                        <img
                                            src={image.image_url}
                                            alt={`${formData.place_name} existing`}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="hidden-gem-file-status">
                                No existing images.
                            </p>
                        )}
                    </div>

                    <div className="edit-hidden-gem-images-section">
                        <h4>Add New Images</h4>

                        <div className="hidden-gem-upload-row">
                            <label className="hidden-gem-file-label">
                                Choose Images
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    hidden
                                    onChange={(event) => {
                                        const selectedFiles = Array.from(
                                            event.target.files
                                        );

                                        setNewImages((prev) => [
                                            ...prev,
                                            ...selectedFiles.map((file) => ({
                                                file,
                                                previewUrl: URL.createObjectURL(file),
                                            })),
                                        ]);

                                        event.target.value = "";
                                    }}
                                />
                            </label>

                            <span className="hidden-gem-file-status">
                                {newImages.length > 0
                                    ? `${newImages.length} file(s) selected`
                                    : "No new images selected"}
                            </span>
                        </div>

                        {newImages.length > 0 && (
                            <div className="hidden-gem-image-preview">
                                {newImages.map((image, index) => (
                                    <div
                                        key={image.previewUrl}
                                        className="hidden-gem-preview-item"
                                    >
                                        <img
                                            src={image.previewUrl}
                                            alt={`new preview ${index + 1}`}
                                        />
                                        <button
                                            type="button"
                                            className="hidden-gem-remove-image-btn"
                                            onClick={() => {
                                                URL.revokeObjectURL(
                                                    image.previewUrl
                                                );
                                                setNewImages((prev) =>
                                                    prev.filter(
                                                        (_, imageIndex) =>
                                                            imageIndex !== index
                                                    )
                                                );
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <small className="edit-hidden-gem-warning">
                        Editing this hidden gem will reset it for
                        re-verification by AI.
                    </small>

                    <button
                        type="submit"
                        className="hidden-gem-submit-btn"
                        disabled={saving}
                    >
                        {saving ? "Saving..." : "Save Changes"}
                    </button>

                </form>
                )}
            </div>
        </div>
    );
}
