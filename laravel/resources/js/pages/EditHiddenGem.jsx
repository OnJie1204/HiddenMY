import LocationPickerMap from "../components/LocationPickerMap";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    getHiddenGemDetail,
    getCategories,
    updateHiddenGem,
    geocodeAddress
} from "../api/hiddenGems";

import "../styles/global.css";

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
    const [geocoding, setGeocoding] = useState(false);
    const [geocodeStatus, setGeocodeStatus] = useState("");
    const [mapFocusRequest, setMapFocusRequest] = useState(null);
    const [postcodeDetectionFailed, setPostcodeDetectionFailed] = useState(false);

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

                setFormData({
                    category_id: gem.category_id || "",
                    place_name: gem.place_name || "",
                    address: gem.address || "",
                    state: gem.state || "",
                    postcode: gem.postcode || "",
                    description: gem.description || "",
                    latitude: gem.latitude || "",
                    longitude: gem.longitude || "",
                });

                setCategories(categoryRes.data.data || []);

            } catch (error) {
                console.error("Failed to load hidden gem:", error);

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
        }, 3000);

        return () => clearTimeout(timer);
    }, [message]);

    const handleFindCoordinates = async () => {
        const query = [
            formData.address,
            formData.state,
            formData.postcode,
            "Malaysia"
        ]
            .filter((part) => String(part).trim() !== "")
            .join(", ");

        if (!formData.address.trim()) {
            setGeocodeStatus("error:Enter an address first.");
            return;
        }

        setGeocoding(true);
        setGeocodeStatus("");

        try {
            const response = await geocodeAddress(query);
            const latitude = String(response.data.latitude);
            const longitude = String(response.data.longitude);

            setFormData((prev) => ({
                ...prev,
                latitude,
                longitude,
            }));

            setMapFocusRequest((previousRequest) => ({
                latitude,
                longitude,
                requestId: (previousRequest?.requestId || 0) + 1,
            }));

            setGeocodeStatus(`success:Found: ${response.data.name}`);
        } catch (error) {
            // ...
        } finally {
            setGeocoding(false);
        }
    };

    const handleChange = (e) => {
        setFormData((prev) => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        setSaving(true);

        try {
            const response = await updateHiddenGem(id, formData);

            setMessage(response.data.message);

            setTimeout(() => {
                navigate("/my-hidden-gems");
            }, 1200);

        } catch (error) {
            console.error("Update failed:", error);

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
                <div className="hidden-gem-snackbar">
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

                <form onSubmit={handleSubmit}>

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

                    {postcodeDetectionFailed && !formData.postcode && (
                        <small className="edit-hidden-gem-warning">
                            Postcode could not be detected automatically. Please enter it manually.
                        </small>
                    )}

                    <LocationPickerMap
                        latitude={formData.latitude}
                        longitude={formData.longitude}
                        focusRequest={mapFocusRequest}
                        onLocationSelected={(location) => {
                            const postcode = String(location.postcode ?? "").trim()
                                || String(location.address ?? "").match(/\b\d{5}\b/)?.[0]
                                || "";

                            setPostcodeDetectionFailed(!postcode);

                            setFormData((prev) => ({
                                ...prev,
                                address: location.address || prev.address,
                                state: location.state || prev.state,
                                postcode,
                                latitude: String(location.latitude),
                                longitude: String(location.longitude),
                            }));
                        }}
                    />

                    <div className="hidden-gem-geocode-row">
                        <button
                            type="button"
                            className="hidden-gem-geocode-btn"
                            onClick={handleFindCoordinates}
                            disabled={geocoding}
                        >
                            {geocoding
                                ? "Finding…"
                                : "📍 Find Coordinates from Address"}
                        </button>

                        {geocodeStatus && (
                            <span
                                className={
                                    geocodeStatus.startsWith("error:")
                                        ? "hidden-gem-geocode-status hidden-gem-geocode-status-error"
                                        : "hidden-gem-geocode-status hidden-gem-geocode-status-success"
                                }
                            >
                                {geocodeStatus.replace(/^(error|success):/, "")}
                            </span>
                        )}
                    </div>

                    <div className="hidden-gem-coordinate-box">
                        <div className="hidden-gem-coordinate-header">
                            <span className="hidden-gem-coordinate-icon">📍</span>

                            <div>
                                <h4>Location Coordinates</h4>
                                <p>
                                    Automatically generated from the address.
                                </p>
                            </div>
                        </div>

                        <div className="hidden-gem-coordinate-values">
                            <div className="hidden-gem-coordinate-item">
                                <span>Latitude</span>
                                <strong>
                                    {formData.latitude || "Not available"}
                                </strong>
                            </div>

                            <div className="hidden-gem-coordinate-item">
                                <span>Longitude</span>
                                <strong>
                                    {formData.longitude || "Not available"}
                                </strong>
                            </div>
                        </div>
                    </div>

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

                    <small className="edit-hidden-gem-warning">
                        Editing this hidden gem will reset its verification progress.
                    </small>

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
