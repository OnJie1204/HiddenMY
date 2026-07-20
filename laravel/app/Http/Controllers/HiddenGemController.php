<?php

namespace App\Http\Controllers;

use App\Models\HiddenGem;
use Illuminate\Http\Request;

class HiddenGemController extends Controller
{
    // read all
    public function index()
    {
        return response()->json(
            HiddenGem::all()
        );
    }
    //read recent
    public function recent()
    {
        return HiddenGem::latest()
            ->take(5)
            ->get();
    }

    // read by id
    public function show($id)
    {
        return response()->json(
            HiddenGem::findOrFail($id)
        );
    }

    // create
    public function store(Request $request)
    {
        $gem = HiddenGem::create(
            $request->all()
        );
        return response()->json($gem);
    }

    // update
    public function update(Request $request,$id)
    {
        $gem = HiddenGem::findOrFail($id);
        $gem->update(
            $request->all()
        );
        return response()->json($gem);
    }

    // delete
    public function destroy($id)
    {
        HiddenGem::destroy($id);
        return response()->json([
            "message"=>"Deleted successfully"
        ]);
    }
}
