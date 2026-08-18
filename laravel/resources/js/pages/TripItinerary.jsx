import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
    getTripItineraries,
    createTripItinerary,
    updateTripItinerary,
    deleteTripItinerary
} from "../api/TripItinerary";

import "../styles/global.css";

export default function TripItinerary() {

    const [tripName, setTripName] = useState("");

    const handleSubmit = (e) => {
        e.preventDefault();

        if (tripName.trim().length < 1) {
            alert("Trip name must contain at least 1 character");
            return;
        }

        if (tripName.trim().length > 10) {
            alert("Trip name cannot exceed 10 characters");
            return;
        }

        handleCreate(); // your existing create function

        setShowCreateModal(false);
        setTripName("");
    };

    const [tripItineraries, setTripItineraries] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [editingName, setEditingName] = useState("");
    const [showCreateModal, setShowCreateModal] = useState(false);
    const navigate = useNavigate();

    const loadTripItineraries = () => {
        getTripItineraries()
            .then(res => {
                setTripItineraries(res.data);
            })
            .catch(err => {
                console.log(err);
            });
    };

    useEffect(() => {
        loadTripItineraries();
    }, []);

    const handleCreate = () => {

        if (!tripName.trim()) return;

        createTripItinerary({
            trip_name: tripName
        })
            .then((res) => {

                setTripName("");

                const newTrip = res.data.data;

                setTripItineraries(prev => [
                    newTrip,
                    ...prev
                ]);

            })
            .catch(console.error);

    };

    const handleUpdate = (id) => {

        updateTripItinerary(id, {
            name: editingName
        })
            .then(() => {
                setEditingId(null);
                loadTripItineraries();
            });

    };

    const handleDelete = (id) => {

        if (!window.confirm("Delete this itinerary?"))
            return;

        deleteTripItinerary(id)
            .then(() => {

                setTripItineraries(prev =>
                    prev.filter(trip => trip.id !== id)
                );

            });

    };

    return (
        <div className="trip-page">

            <div className="trip-header">

                <h1>
                    My Trip Itineraries
                </h1>

                <button
                    className="trip-itinerary-create-btn"
                    onClick={() => setShowCreateModal(true)}
                >
                    + Create Itinerary
                </button>

            </div>


            <div className="trip-list">

                {tripItineraries.map((trip) => (

                    <div
                        className="trip-card"
                        key={trip.id}
                        onClick={() => navigate(`/trip-itinerary/${trip.id}`, {
                            state: {
                                itinerary: trip
                            }
                        })}
                    >

                        <h2>
                            {trip.trip_name}
                        </h2>

                        <div className="trip-itinerary-card-dates">

                            <p className="trip-itinerary-created-date">
                                Created:
                                {" "}
                                {new Date(trip.created_at).toLocaleDateString(
                                    "en-GB",
                                    {
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric"
                                    }
                                )}
                            </p>

                            {trip.created_at !== trip.updated_at && (

                                <p className="trip-itinerary-modified-date">
                                    Last Modified:
                                    {" "}
                                    {new Date(trip.updated_at).toLocaleDateString(
                                        "en-GB",
                                        {
                                            day: "numeric",
                                            month: "short",
                                            year: "numeric"
                                        }
                                    )}
                                </p>

                            )}

                        </div>

                    </div>

                ))}

            </div>



            {
                showCreateModal && (

                    <div className="modal-overlay">

                        <div className="modal">


                            <h2>
                                Create New Itinerary
                            </h2>


                            <form onSubmit={handleSubmit}>
                                <input
                                    placeholder="Enter trip name"
                                    value={tripName}
                                    onChange={(e) => setTripName(e.target.value)}
                                />

                                <div className="trip-create-modal-actions">

                                    <button
                                        type="button"
                                        className="trip-create-modal-cancel-btn"
                                        onClick={() => {
                                            setShowCreateModal(false);
                                            setTripName("");
                                        }}
                                    >
                                        Cancel
                                    </button>

                                    <button
                                        type="submit"
                                        className="trip-create-modal-confirm-btn"
                                        disabled={!tripName.trim()}
                                    >
                                        Create Itinerary
                                    </button>

                                </div>
                            </form>


                        </div>

                    </div>

                )
            }


        </div>
    );
}