import { useEffect } from "react";
import { getTripItineraries } from "../api/TripItinerary";

export default function TripItinerary() {

    useEffect(() => {
        getTripItineraries()
            .then(res => console.log(res.data))
            .catch(err => console.log(err));
    }, []);

    return (
        <div>
            <h1>Trip Itinerary</h1>
        </div>
    );
}