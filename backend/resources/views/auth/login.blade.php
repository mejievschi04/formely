<form method="POST" action="/login">
    @csrf
    <input type="email" name="email" placeholder="Email" required>
    <input type="password" name="password" placeholder="Parolă" required>
    <button type="submit">Login</button>
</form>
<a href="/register">Înregistrare</a>
