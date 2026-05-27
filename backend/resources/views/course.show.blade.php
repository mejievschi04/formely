<h2>{{ $lesson->title }}</h2>
<p>{{ $lesson->content }}</p>

<form method="POST" action="/lessons/{{ $lesson->id }}/complete">
    @csrf
    @if($user->lessonsProgress->contains($lesson->id))
        <button disabled>Lecție finalizată ✅</button>
    @else
        <button type="submit">Marchează ca finalizat</button>
    @endif
</form>
