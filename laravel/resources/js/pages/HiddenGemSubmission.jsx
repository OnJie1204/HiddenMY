import { useState } from "react";
import { createHiddenGem } from "../api/hiddenGems";

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

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };


    const handleSubmit = async (e) => {
        e.preventDefault();

        try {

            const response = await createHiddenGem(formData);

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


                <input
                    name="category_id"
                    placeholder="Category ID"
                    value={formData.category_id}
                    onChange={handleChange}
                />


                <button type="submit">
                    Submit
                </button>

            </form>


            <p>{message}</p>

        </div>
    );
}

