import { useState, useEffect } from "react";
import { createHiddenGem, getCategories } from "../api/hiddenGems";

export default function HiddenGemSubmission() {

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

    const fetchCategories = async () => {
        try {
            const response = await getCategories();

            console.log("Category API:", response.data);

            setCategories(response.data.data || []);

        } catch (error) {
            console.error(error);
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

        } catch (error) {

            setMessage(
                error.response?.data?.message ||
                "Failed to submit hidden gem."
            );

        }
    };


    return (
        <div>
            <h2>Submit Hidden Gem</h2>

            <form onSubmit={handleSubmit}>

                <input
                    name="place_name"
                    placeholder="Place Name"
                    value={formData.place_name}
                    onChange={handleChange}
                />


                <input
                    name="address"
                    placeholder="Address"
                    value={formData.address}
                    onChange={handleChange}
                />


                <input
                    name="state"
                    placeholder="State"
                    value={formData.state}
                    onChange={handleChange}
                />


                <input
                    name="postcode"
                    placeholder="Postcode"
                    value={formData.postcode}
                    onChange={handleChange}
                />


                <textarea
                    name="description"
                    placeholder="Description"
                    value={formData.description}
                    onChange={handleChange}
                />


                <input
                    name="latitude"
                    placeholder="Latitude"
                    value={formData.latitude}
                    onChange={handleChange}
                />


                <input
                    name="longitude"
                    placeholder="Longitude"
                    value={formData.longitude}
                    onChange={handleChange}
                />


                <select
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

                <input
                    type="file"
                    multiple
                    onChange={(e)=>{
                        setImages(e.target.files);

                        setImagePreview(
                            Array.from(e.target.files).map(file =>
                                URL.createObjectURL(file)
                            )
                        );
                    }}
                />

                <div>
                    {imagePreview.map((img,index)=>(
                        <img 
                            key={index}
                            src={img}
                            width="100"
                            alt={`preview-${index}`}
                        />
                    ))}
                </div>

                <button type="submit">
                    Submit
                </button>

            </form>


            <p>{message}</p>

        </div>
    );
}

