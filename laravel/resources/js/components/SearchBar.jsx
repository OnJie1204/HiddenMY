import { useState } from "react";
import { searchPlaces } from "../api/searchAPI";


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
            const res = await searchPlaces(value);
            setResults(res.data);
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
        setQuery(item.title);
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
                    item.type === "hidden_gem"
                    ?
                    "💎"
                    :
                    "📍"
                }
                {" "}
                <b>
                    {item.title}
                </b>
                <br/>
                <small>
                {
                    item.type === "hidden_gem"
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