import { useState } from "react";
import { searchHiddenGems } from "../api/hiddenGems";


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
            const res = await searchHiddenGems(value);
            const database = res.data.database || [];
            const osm = res.data.openStreetMap || [];
            setResults([...database, ...osm]);
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
        setQuery(item.name);
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
                    item.source === "database"
                    ?
                    "💎"
                    :
                    "📍"
                }
                {" "}
                <b>{item.name}</b>
                <br/>
                <small>
                {
                    item.source === "database"
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