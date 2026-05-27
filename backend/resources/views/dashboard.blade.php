<h1>Bine ai venit, {{ $user->name }}</h1>
<h2>Cursuri disponibile:</h2>
<ul>
@foreach($courses as $course)
    <li>
        <a href="/courses/{{ $course->id }}">{{ $course->title }}</a>
    </li>
@endforeach
</ul>
