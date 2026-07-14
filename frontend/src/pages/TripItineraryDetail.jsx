import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";


import "../styles/global.css";


export default function TripItineraryDetail() {

    const navigate = useNavigate();

    const { id } = useParams();


    const [tripName, setTripName] = useState("Japan Trip");


    const [locations, setLocations] = useState([
        {
            id: 1,
            name: "Tokyo Tower",
            type: "tourist"
        },
        {
            id: 2,
            name: "Hidden Cafe",
            type: "hidden"
        },
        {
            id: 3,
            name: "Shibuya Crossing",
            type: "tourist"
        }
    ]);



    const handleRename = () => {

        const newName = prompt(
            "Enter new itinerary name",
            tripName
        );


        if (newName) {

            setTripName(newName);

        }

    };



    const handleDelete = () => {

        const confirmDelete =
            window.confirm(
                "Delete this itinerary?"
            );


        if (confirmDelete) {

            navigate("/trip-itinerary");

        }

    };



    const removeLocation = (locationId) => {

        setLocations(
            locations.filter(
                item => item.id !== locationId
            )
        );

    };



    return (

        <div className="trip-detail-container">


            <button
                className="trip-detail-back-btn"
                onClick={() => navigate("/trip-itinerary")}
            >
                ← Back to My Itineraries
            </button>



            <div className="trip-detail-header">


                <div>

                    <h1>
                        {tripName}
                    </h1>

                    <p className="trip-detail-created-date">
                        Created on 12 July 2026
                    </p>

                </div>



                <div>

                    <button className="trip-detail-btn trip-detail-rename-btn">
                        ✏ Rename
                    </button>


                    <button className="trip-detail-btn trip-detail-delete-btn">
                        🗑 Delete
                    </button>

                </div>


            </div>





            <hr />



            <div className="trip-detail-section-header">

                <h2>Trip Stops</h2>

                <span>
                    {locations.length} Stops
                </span>

            </div>



            <div className="add-buttons">


                <button className="trip-detail-btn trip-detail-add-btn">
                    + Add Stopping Point
                </button>


            </div>





            <div className="location-list">


                {
                    locations.map(
                        (location, index) => (


                            <div
                                className="location-card"
                                key={location.id}
                            >


                                <div>

                                    <div className="trip-detail-location-title">

                                        <h3>
                                            {index + 1}. {location.name}
                                        </h3>


                                        <span
                                            className={
                                                location.type === "hidden"
                                                    ?
                                                    "trip-detail-location-icon hidden"
                                                    :
                                                    "trip-detail-location-icon tourist"
                                            }
                                        >
                                            {
                                                location.type === "hidden"
                                                    ? "✨"
                                                    : "📍"
                                            }
                                        </span>

                                    </div>


                                </div>




                                <button className="trip-detail-btn trip-detail-remove-btn" onClick={() =>
                                    removeLocation(
                                        location.id
                                    )
                                }>
                                    Remove
                                </button>



                            </div>


                        )

                    )
                }


            </div>





            <button className="trip-detail-btn trip-detail-route-btn">
                🗺 Open Route in Google Maps
            </button>



        </div>

    );

}