import { useState } from "react";
<<<<<<< HEAD
import { searchHiddenGems } from "../api/hiddenGems";
=======
import { searchPlaces } from "../api/searchAPI";
>>>>>>> Interactive-Map


function SearchBar({onSelect}){

    const [query,setQuery]=useState("");
    const [results,setResults]=useState([]);
    const [loading,setLoading]=useState(false);


    async function handleSearch(value){
        setQuery(value);

        if(value.length < 2){
            setResults([]);
            return;
        }

        try{
            setLoading(true);
<<<<<<< HEAD
            const res = await searchHiddenGems(value);
            const database = res.data.database || [];
            const osm = res.data.openStreetMap || [];
            setResults([...database, ...osm]);
=======
            const res = await searchPlaces(value);
            setResults(res.data);
>>>>>>> Interactive-Map
        }
        catch(error){
            console.log(
                "Search error:",
                error
            );
        }
        finally{
            setLoading(false);
        }
    }


    function selectResult(item){
<<<<<<< HEAD
        setQuery(item.name);
=======
        setQuery(item.title);
>>>>>>> Interactive-Map
        setResults([]);
        onSelect(item);
    }


    return (
        <div
        className="search-container"
        >
            <input
            value={query}
            onChange={(e)=>
                handleSearch(e.target.value)
            }
            placeholder="Search hidden gems or attractions..."
            className="search-input"
            />
            {loading &&
            <p>
                Searching...
            </p>
            }

            {results.length > 0 &&
            <div className="search-dropdown">
            {
            results.map((item,index)=>(
                <div
                key={
                    item.id ?? index
                }
                onClick={()=>
                    selectResult(item)
                }
                style={{
                    padding:"12px",
                    cursor:"pointer",
                    borderBottom:"1px solid #ddd"
                }}
                >
                {
<<<<<<< HEAD
                    item.source === "database"
=======
                    item.type === "hidden_gem"
>>>>>>> Interactive-Map
                    ?
                    "💎"
                    :
                    "📍"
                }
                {" "}
<<<<<<< HEAD
                <b>{item.name}</b>
                <br/>
                <small>
                {
                    item.source === "database"
=======
                <b>
                    {item.title}
                </b>
                <br/>
                <small>
                {
                    item.type === "hidden_gem"
>>>>>>> Interactive-Map
                    ?
                    "Hidden Gem"
                    :
                    "Attraction"
                }
                </small>
                </div>
            ))
            }
            </div>
            }
        </div>
    );
}
export default SearchBar;