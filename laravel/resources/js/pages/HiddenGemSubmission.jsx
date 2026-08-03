import { useState, useEffect, useRef } from "react";
import { createHiddenGem, getCategories } from "../api/hiddenGems";
import { useNavigate } from "react-router-dom";

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
        latitude: "",
        longitude: "",
    });

    const [message, setMessage] = useState("");
    const [categories, setCategories] = useState([]);
    const [images,setImages]=useState([]);
    const [imagePreview,setImagePreview] = useState([]);

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


    const handleSubmit = async (e) => {
        e.preventDefault();

        try {

            const data = new FormData();

            Object.keys(formData).forEach((key) => {
                data.append(key, formData[key]);
            });


            for (let i = 0; i < images.length; i++) {
                data.append("images[]", images[i]);
            }


            const response = await createHiddenGem(data);

            setMessage(response.data.message);

            setFormData({
                category_id: "",
                place_name: "",
                address: "",
                state: "",
                postcode: "",
                description: "",
                latitude: "",
                longitude: "",
            });

            setImages([]);
            setImagePreview([]);

            if(fileInputRef.current){
                fileInputRef.current.value="";
            }

        } catch (error) {

            setMessage(
                error.response?.data?.message ||
                "Failed to submit hidden gem."
            );

        }
    };


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
                        onClick={() => navigate(-1)}
                    >
                        ← 
                    </button>


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


                    <input
                        className="form-input"
                        name="address"
                        placeholder="Address"
                        value={formData.address}
                        onChange={handleChange}
                    />


                    <input
                        className="form-input"
                        name="state"
                        placeholder="State"
                        value={formData.state}
                        onChange={handleChange}
                    />


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


                    <input
                        className="form-input"
                        name="latitude"
                        placeholder="Latitude"
                        value={formData.latitude}
                        onChange={handleChange}
                    />


                    <input
                        className="form-input"
                        name="longitude"
                        placeholder="Longitude"
                        value={formData.longitude}
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
                    >
                        Submit Hidden Gem
                    </button>

                </form>
            </div>
        </div>
    );
}

