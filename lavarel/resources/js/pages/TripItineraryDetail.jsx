import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useState } from "react";
import { updateTripItinerary, deleteTripItinerary } from "../api/TripItinerary";

import {
    DndContext,
    closestCenter
} from "@dnd-kit/core";

import {
    SortableContext,
    arrayMove,
    verticalListSortingStrategy,
    useSortable
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

import { MdDragIndicator } from "react-icons/md";


import "../styles/global.css";

/* dragable location card component */
function SortableLocationCard({

    location,

    index,

    onDelete

}) {

    const {

        attributes,

        listeners,

        setNodeRef,

        transform,

        transition

    } = useSortable({

        id: location.id

    });

    const style = {

        transform: CSS.Transform.toString(transform),

        transition

    };

    return (

        <div

            ref={setNodeRef}

            style={style}

            className="trip-detail-location-card"

        >

            <div

                className="trip-detail-drag-handle"

                {...attributes}

                {...listeners}

            >

                <MdDragIndicator size={22} />

            </div>

            <div className="trip-detail-location-icon">

                {location.type === "hidden"

                    ? "💎"

                    : "📍"}

            </div>

            <div className="trip-detail-location-name">
                {index + 1}. {location.name}
            </div>

            <button

                className="trip-detail-delete-stop-btn"

                onClick={() => onDelete(location.id)}

            >

                🗑

            </button>

        </div>

    );

}




export default function TripItineraryDetail() {
    const navigate = useNavigate();

    const { id } = useParams();

    const { state } = useLocation();

    const [trip, setTrip] = useState(
        state?.itinerary || null
    );

    const createdDate = trip?.created_at
        ? new Date(trip.created_at).toLocaleDateString(
            "en-GB",
            {
                day: "numeric",
                month: "long",
                year: "numeric"
            }
        )
        : "";

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

    const handleDragEnd = (event) => {

        const {

            active,

            over

        } = event;

        if (!over) return;

        if (active.id !== over.id) {

            setLocations((items) => {

                const oldIndex = items.findIndex(

                    item => item.id === active.id

                );

                const newIndex = items.findIndex(

                    item => item.id === over.id

                );

                return arrayMove(

                    items,

                    oldIndex,

                    newIndex

                );

            });

        }

    };



    const handleRename = async () => {

        const newName = prompt(
            "Enter new itinerary name",
            trip?.trip_name
        );

        if (!newName || !newName.trim()) return;

        try {

            await updateTripItinerary(id, {
                trip_name: newName
            });

            setTrip({
                ...trip,
                trip_name: newName
            });

        } catch (err) {

            console.error(err);
            alert("Failed to rename itinerary.");

        }

    };



    const handleDelete = async () => {

        if (!window.confirm("Delete this itinerary?")) return;

        try {

            await deleteTripItinerary(id);

            navigate("/trip-itinerary");

        } catch (err) {

            console.error(err);

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

                    <h1>{trip?.trip_name}</h1>

                    <p className="trip-detail-created-date">
                        Created on {createdDate}
                    </p>

                </div>



                <div>

                    <button className="trip-detail-btn trip-detail-rename-btn" onClick={handleRename}>
                        ✏ Rename
                    </button>


                    <button className="trip-detail-btn trip-detail-delete-btn" onClick={handleDelete}>
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

                <DndContext
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >

                    <SortableContext
                        items={locations}
                        strategy={verticalListSortingStrategy}
                    >

                        {locations.map((location, index) => (

                            <SortableLocationCard
                                key={location.id}
                                location={location}
                                index={index}
                                onDelete={removeLocation}
                            />

                        ))}

                    </SortableContext>

                </DndContext>

            </div>





            <button className="trip-detail-btn trip-detail-route-btn">
                🗺 Open Route in Google Maps
            </button>



        </div>

    );

}