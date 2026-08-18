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
        latitude: "",
        longitude: "",
    });

    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [message, setMessage] = useState("");
    const [messageType, setMessageType] = useState("");

    const [postcodeDetectionFailed, setPostcodeDetectionFailed] = useState(false);
    const [coreFieldsLocked, setCoreFieldsLocked] = useState(false);
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
                if (gem.status !== "pending") {
                    navigate("/my-hidden-gems");
                    return;
                }

                const loadedFormData = {
                    category_id: gem.category_id || "",
                    place_name: gem.place_name || "",
                    address: gem.address || "",
                    state: gem.state || "",
                    postcode: gem.postcode || "",
                    description: gem.description || "",
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

                setCoreFieldsLocked(Number(gem.vote_count) > 0);

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
            let dataToSave = coreFieldsLocked
                ? { description: formData.description }
                : { ...formData };

            if (!coreFieldsLocked) {
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

                        const geocodedState = String(
                            geocodeResponse.data.state ?? ""
                        ).trim();

                        const geocodedPostcode = String(
                            geocodeResponse.data.postcode ?? ""
                        ).trim();

                        const stateMatches =
                            geocodedState !== ""
                            && geocodedState.toLowerCase()
                                === currentLocation.state.toLowerCase();

                        const postcodeMatches =
                            geocodedPostcode === ""
                            || geocodedPostcode === currentLocation.postcode;

                        if (!stateMatches || !postcodeMatches) {
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
                    <button
                        type="button"
                        className="hidden-gem-back-btn"
                        onClick={() => navigate("/my-hidden-gems")}
                    >
                        ←
                    </button>

                    <h2>Edit Hidden Gem</h2>
                </div>

                <form className="edit-hidden-gem-form" onSubmit={handleSubmit}>

                    {coreFieldsLocked && (
                        <small className="edit-hidden-gem-warning">
                            Community verification has started.
                            Location details can no longer be changed,
                            but you can still update the description.
                        </small>
                    )}

                    <input
                        className="form-input"
                        name="place_name"
                        placeholder="Place Name"
                        value={formData.place_name}
                        onChange={handleChange}
                        disabled={coreFieldsLocked}
                        required
                    />

                    <input
                        className="form-input"
                        name="address"
                        placeholder="Address"
                        value={formData.address}
                        onChange={handleChange}
                        disabled={coreFieldsLocked}
                        required
                    />

                    <select
                        className="form-input"
                        name="state"
                        value={formData.state}
                        onChange={handleChange}
                        disabled={coreFieldsLocked}
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
                        disabled={coreFieldsLocked}
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
                        disabled={coreFieldsLocked}
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

                    <select
                        className="form-input"
                        name="category_id"
                        value={formData.category_id}
                        onChange={handleChange}
                        disabled={coreFieldsLocked}
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
                            <label
                                className={`hidden-gem-file-label ${
                                    coreFieldsLocked
                                        ? "edit-hidden-gem-file-label-disabled"
                                        : ""
                                }`}
                            >
                                Choose Images
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    hidden
                                    disabled={coreFieldsLocked}
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
                                {coreFieldsLocked
                                    ? "Image uploads are locked after voting starts."
                                    : newImages.length > 0
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

                    {!coreFieldsLocked && (
                        <small className="edit-hidden-gem-warning">
                            Editing this hidden gem will reset its
                            verification progress.
                        </small>
                    )}

                    <button
                        type="submit"
                        className="hidden-gem-submit-btn"
                        disabled={saving}
                    >
                        {saving ? "Saving..." : "Save Changes"}
                    </button>

                </form>
            </div>
        </div>
    );
}
