<?php

namespace App\Http\Controllers;

use App\Models\HiddenGem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class SearchController extends Controller
{
    public function search(Request $request){
        $query = trim($request->q);
        if (!$query) {
            return response()->json([]);
        }

        // Search Hidden Gems
        $hiddenGems = HiddenGem::where('title', 'LIKE', "%{$query}%")
            ->orWhere('address', 'LIKE', "%{$query}%")
            ->orWhere('state', 'LIKE', "%{$query}%")
            ->get()
            ->map(function ($gem) {
                return [
                    'id' => $gem->id,
                    'type' => 'hidden_gem',
                    'title' => $gem->title,
                    'description' => $gem->description,
                    'address' => $gem->address,
                    'state' => $gem->state,
                    'latitude' => $gem->latitude,
                    'longitude' => $gem->longitude,
                    'cover_image' => $gem->cover_image,
                ];
            });

        // Search Photon (OpenStreetMap)
        $response = Http::get(
            'https://photon.komoot.io/api/',
            [
                'q' => $query . ' Malaysia',
                'limit' => 8,
            ]
        );
        $places = [];

        if ($response->successful()) {
            foreach ($response->json()['features'] as $feature) {
                $places[] = [
                    'id' => null,
                    'type' => 'attraction',
                    'title' =>
                        $feature['properties']['name'] ??
                        'Unknown',

                    'description' => '',
                    'address' =>
                        $feature['properties']['city'] ??
                        $feature['properties']['district'] ??
                        '',
                    'state' =>
                        $feature['properties']['state'] ??
                        '',
                    'latitude' =>
                        $feature['geometry']['coordinates'][1],
                    'longitude' =>
                        $feature['geometry']['coordinates'][0],
                    'cover_image' => null,
                ];
            }
        }
        return response()->json(
            array_merge(
                $hiddenGems->toArray(),
                $places
            )
        );
    }
}