<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Course;
use Illuminate\Support\Facades\Auth;

class DashboardController extends Controller
{
    public function index() {
        $user = Auth::user();

        // Pentru student: cursurile înscrise sau disponibile
        $courses = Course::all(); 

        return view('dashboard', compact('user','courses'));
    }

    public function showCourse($id) {
        $course = Course::with('lessons')->findOrFail($id);
        $user = Auth::user();

        // Poți adăuga aici progresul lecțiilor pentru student
        return view('course.show', compact('course','user'));
    }
}
