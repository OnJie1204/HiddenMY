import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createHiddenGem, getCategories, geocodeAddress } from "@/features/hidden-gems/api";
import LocationPickerMap from "@/components/hidden-gems/LocationPickerMap";
import AddressAutocomplete from "@/components/hidden-gems/AddressAutocomplete";
import Spinner from "@/components/common/Spinner";

// Approximate state-capital coordinates, used only as a map-centering
// fallback when the address itself can't be geocoded — never submitted as
// the gem's actual location. Keeps the "point to the address" behavior
// working even when Nominatim can't find the exact address, without relying
// on a second, equally failure-prone geocoding call.
const STATE_FALLBACK_CENTERS = {
    "Johor": { latitude: 1.4927, longitude: 103.7414 },
    "Kuala Lumpur": { latitude: 3.1390, longitude: 101.6869 },
    "Penang": { latitude: 5.4141, longitude: 100.3288 },
    "Selangor": { latitude: 3.0733, longitude: 101.5185 },
    "Melaka": { latitude: 2.1896, longitude: 102.2501 },
    "Perak": { latitude: 4.5975, longitude: 101.0901 },
    "Pahang": { latitude: 3.8077, longitude: 103.3260 },
    "Sarawak": { latitude: 1.5533, longitude: 110.3592 },
    "Sabah": { latitude: 5.9804, longitude: 116.0735 },
    "Terengganu": { latitude: 5.3117, longitude: 103.1324 },
    "Kelantan": { latitude: 6.1254, longitude: 102.2381 },
    "Kedah": { latitude: 6.1184, longitude: 100.3685 },
    "Negeri Sembilan": { latitude: 2.7258, longitude: 101.9424 },
    "Perlis": { latitude: 6.4414, longitude: 100.1986 },
    "Putrajaya": { latitude: 2.9264, longitude: 101.6964 },
    "Labuan": { latitude: 5.2831, longitude: 115.2308 },
};

const STATE_FALLBACK_ZOOM = 10;

export default function HiddenGemSubmission() {

    const navigate = useNavigate();
    const fileInputRef = useRef(null);

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

    const [message, setMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [categories, setCategories] = useState([]);
    const [images,setImages]=useState([]);
    const [imagePreview,setImagePreview] = useState([]);
    const [geocoding, setGeocoding] = useState(false);
    const [geocodeStatus, setGeocodeStatus] = useState("");
    const [mapFocusRequest, setMapFocusRequest] = useState(null);

    useEffect(() => {
        fetchCategories();
    }, []);

    useEffect(() => {
        if(message){
            const timer = setTimeout(()=>{
                setMessage("");
            },3000);
            return () => clearTimeout(timer);
        }
    },[message]);

    const fetchCategories = async () => {
        try {
            const response = await getCategories();

            console.log("Category API:", response.data);

            setCategories(response.data.data || []);

        } catch (error) {
            console.error(error);
        }
    };

    const removeImages = () => {
        setImages([]);
        setImagePreview([]);

        if(fileInputRef.current){
            fileInputRef.current.value = "";
        }
    };
    
    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    const handleFindCoordinates = async () => {
        if (!formData.address.trim()) {
            setGeocodeStatus("error:Enter an address first.");
            return;
        }

        // Try progressively coarser queries: the full address first, then
        // just the postcode (Malaysian postcodes are narrow enough — usually
        // a few km across — to still be a useful pin), then the state as a
        // last resort before falling back to the hardcoded state-capital
        // table. Nominatim often can't match an informal full address even
        // though a plainer subset of the same fields resolves fine.
        const attempts = [
            {
                query: [formData.address, formData.state, formData.postcode, "Malaysia"]
                    .filter((part) => String(part).trim() !== "")
                    .join(", "),
                precision: "exact",
                zoom: 15,
            },
            formData.postcode.trim() && formData.state
                ? {
                    query: `${formData.postcode.trim()}, ${formData.state}, Malaysia`,
                    precision: "postcode",
                    zoom: 13,
                }
                : null,
            formData.state
                ? {
                    query: `${formData.state}, Malaysia`,
                    precision: "state",
                    zoom: STATE_FALLBACK_ZOOM,
                }
                : null,
        ].filter(Boolean);

        setGeocoding(true);
        setGeocodeStatus("");

        for (const attempt of attempts) {
            try {
                const response = await geocodeAddress(attempt.query);

                setFormData((prev) => ({
                    ...prev,
                    state: response.data.state || prev.state,
                }));

                if (attempt.precision === "exact") {
                    setFormData((prev) => ({
                        ...prev,
                        latitude: String(response.data.latitude),
                        longitude: String(response.data.longitude),
                    }));
                }

                setMapFocusRequest({
                    latitude: response.data.latitude,
                    longitude: response.data.longitude,
                    zoom: attempt.zoom,
                });

                setGeocodeStatus(
                    attempt.precision === "exact"
                        ? `success:Found: ${response.data.name}`
                        : `success:Couldn't match the exact address, but zoomed to your ${attempt.precision === "postcode" ? "postcode area" : "state"} below — click your spot on the map to pinpoint it.`
                );

                setGeocoding(false);
                return;
            } catch (error) {
                // Try the next, coarser attempt.
            }
        }

        const stateFallback = STATE_FALLBACK_CENTERS[formData.state];

        if (stateFallback) {
            setMapFocusRequest({ ...stateFallback, zoom: STATE_FALLBACK_ZOOM });
        }

        setGeocodeStatus(
            stateFallback
                ? `error:Couldn't look up that address right now. The map below is now centred on ${formData.state} — click your spot on it instead.`
                : `error:Couldn't look up that address right now. Try clicking your spot on the map below instead.`
        );

        setGeocoding(false);
    };


    const handleSubmit = async (e) => {
        e.preventDefault();

        if (submitting) return;

        if (formData.latitude === "" || formData.longitude === "") {
            setMessage("Please select a location on the map before submitting.");
            return;
        }

        setSubmitting(true);

        try {

            const data = new FormData();

            Object.keys(formData).forEach((key) => {
                data.append(key, formData[key]);
            });


            for (let i = 0; i < images.length; i++) {
                data.append("images[]", images[i]);
            }


            await createHiddenGem(data);

            // Land on My Hidden Gems so the submitter sees the new entry and its
            // "Being Verified" status straight away.
            navigate("/my-hidden-gems", {
                state: {
                    flash: "Hidden gem submitted! It's now being reviewed by AI before it can go up for community voting.",
                },
            });
            return;

        } catch (error) {

            setMessage(
                error.response?.data?.message ||
                "Failed to submit hidden gem."
            );

        } finally {
            setSubmitting(false);
        }
    };


    return (
        <div className="hidden-gem-form-page hidden-gem-submission-page">
            {message && (
                <div className="hidden-gem-snackbar">
                    {message}
                </div>
            )}

            <div className="hidden-gem-form-card">

                <div className="hidden-gem-submit-header">

                    <h2>Submit Hidden Gem</h2>

                </div>

                <form onSubmit={handleSubmit}>

                   <input
                        className="form-input"
                        name="place_name"
                        placeholder="Place Name"
                        value={formData.place_name}
                        onChange={handleChange}
                    />


                    <select
                        className="form-input"
                        name="category_id"
                        value={formData.category_id}
                        onChange={handleChange}
                    >
                        <option value="">
                            Select Category
                        </option>

                        {categories.map((category) => (
                            <option
                                key={category.id}
                                value={category.id}
                            >
                                {category.name}
                            </option>
                        ))}
                    </select>

                    <AddressAutocomplete
                        className="form-input"
                        name="address"
                        placeholder="Address"
                        value={formData.address}
                        latitude={formData.latitude}
                        longitude={formData.longitude}
                        onChange={(text) =>
                            setFormData((prev) => ({ ...prev, address: text }))
                        }
                        onSelect={(suggestion) => {
                            setFormData((prev) => ({
                                ...prev,
                                address: suggestion.address || prev.address,
                                state: suggestion.state || prev.state,
                                postcode: suggestion.postcode || prev.postcode,
                                latitude:
                                    suggestion.latitude != null
                                        ? String(suggestion.latitude)
                                        : prev.latitude,
                                longitude:
                                    suggestion.longitude != null
                                        ? String(suggestion.longitude)
                                        : prev.longitude,
                            }));

                            if (
                                suggestion.latitude != null &&
                                suggestion.longitude != null
                            ) {
                                setMapFocusRequest({
                                    latitude: suggestion.latitude,
                                    longitude: suggestion.longitude,
                                    zoom: 16,
                                });
                            }

                            setGeocodeStatus(
                                "success:Address selected and pinned on the map below — drag or click to fine-tune the exact spot."
                            );
                        }}
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
                    />


                    <textarea
                        className="form-input hidden-gem-description"
                        name="description"
                        placeholder="Description"
                        value={formData.description}
                        onChange={handleChange}
                    />

                    <p className="hidden-gem-optional-hint">
                        Optional — please fill in to the best of your knowledge.
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

                    <div className="hidden-gem-geocode-row">
                        <button
                            type="button"
                            className="hidden-gem-geocode-btn"
                            onClick={handleFindCoordinates}
                            disabled={geocoding}
                        >
                            {geocoding ? (
                                <Spinner size="sm" inline label="Finding…" className="btn-spinner" />
                            ) : (
                                "Find Location from Address"
                            )}
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

                    <LocationPickerMap
                        latitude={formData.latitude}
                        longitude={formData.longitude}
                        focusRequest={mapFocusRequest}
                        onLocationSelected={(location) => {
                            setFormData((prev) => ({
                                ...prev,
                                address: location.address || prev.address,
                                state: location.state || prev.state,
                                postcode: location.postcode
                                    ? String(location.postcode)
                                    : prev.postcode,
                                latitude: String(location.latitude),
                                longitude: String(location.longitude),
                            }));
                            setGeocodeStatus("");
                        }}
                    />

                    <div className="hidden-gem-upload-row">
                        <label className="hidden-gem-file-label">
                            Choose Images
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                hidden
                                onChange={(e)=>{

                                    const selectedFiles = Array.from(e.target.files);

                                    setImages(prev => [
                                        ...prev,
                                        ...selectedFiles
                                    ]);

                                    setImagePreview(prev => [
                                        ...prev,
                                        ...selectedFiles.map(file =>
                                            URL.createObjectURL(file)
                                        )
                                    ]);

                                }}
                            />
                        </label>

                        <span className="hidden-gem-file-status">
                            {
                                images.length > 0
                                ? `${images.length} file(s) selected`
                                : "No file selected"
                            }
                        </span>
                    </div>

                    <div className="hidden-gem-image-preview">
                        {imagePreview.map((img,index)=>(
                            <div key={index} className="hidden-gem-preview-item">
                                <img 
                                    src={img}
                                    alt={`preview-${index}`}
                                />
                                <button
                                    type="button"
                                    className="hidden-gem-remove-image-btn"
                                    onClick={() => {

                                        const newImages = [...images];
                                        newImages.splice(index,1);

                                        setImages(newImages);


                                        const newPreview = [...imagePreview];
                                        newPreview.splice(index,1);

                                        setImagePreview(newPreview);


                                        if(fileInputRef.current){
                                            fileInputRef.current.value = "";
                                        }

                                    }}
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>

                    <button
                        type="submit"
                        className="hidden-gem-submit-btn"
                        disabled={submitting}
                    >
                        {submitting ? (
                            <Spinner size="sm" inline label="Submitting…" className="btn-spinner" />
                        ) : (
                            "Submit Hidden Gem"
                        )}
                    </button>

                </form>
            </div>
        </div>
    );
}
