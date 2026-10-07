<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\MediaAsset;
use App\Models\User;
use App\Support\ImageOptimizer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ImageOptimizerTest extends TestCase
{
    use RefreshDatabase;

    /** Imagine „fotografie” (zgomot, deci greu de comprimat) salvată în formatul cerut. */
    private function photo(int $width, int $height, string $format = 'jpeg', bool $alpha = false): UploadedFile
    {
        $image = imagecreatetruecolor($width, $height);
        if ($alpha) {
            imagealphablending($image, false);
            imagesavealpha($image, true);
            imagefill($image, 0, 0, imagecolorallocatealpha($image, 0, 0, 0, 127));
            imagefilledrectangle($image, 0, 0, intdiv($width, 2), $height, imagecolorallocatealpha($image, 200, 30, 30, 0));
        } else {
            for ($y = 0; $y < $height; $y += 4) {
                for ($x = 0; $x < $width; $x += 4) {
                    imagefilledrectangle($image, $x, $y, $x + 3, $y + 3, imagecolorallocate($image, ($x * 7 + $y) % 256, ($y * 3) % 256, random_int(0, 255)));
                }
            }
        }
        $path = tempnam(sys_get_temp_dir(), 'test') . '.' . ($format === 'jpeg' ? 'jpg' : $format);
        match ($format) {
            'jpeg' => imagejpeg($image, $path, 95),
            'png' => imagepng($image, $path),
            'gif' => imagegif($image, $path),
        };
        imagedestroy($image);

        return new UploadedFile($path, 'poza.' . ($format === 'jpeg' ? 'jpg' : $format), 'image/' . $format, null, true);
    }

    public function test_a_large_photo_is_shrunk_to_the_max_side_and_saved_as_webp(): void
    {
        $original = $this->photo(3000, 2000);
        $optimized = ImageOptimizer::optimize($original);

        $this->assertSame('image/webp', $optimized->getMimeType());
        $this->assertSame('poza.webp', $optimized->getClientOriginalName());
        [$width, $height] = getimagesize($optimized->getRealPath());
        $this->assertSame([2000, 1333], [$width, $height]);
        $this->assertLessThan($original->getSize(), $optimized->getSize());
    }

    public function test_a_png_keeps_its_transparency(): void
    {
        $optimized = ImageOptimizer::optimize($this->photo(800, 400, 'png', alpha: true));

        $this->assertSame('image/webp', $optimized->getMimeType());
        $image = imagecreatefromwebp($optimized->getRealPath());
        $alpha = (imagecolorat($image, 700, 200) >> 24) & 0x7F;
        $this->assertSame(127, $alpha, 'the transparent half stays transparent');
    }

    public function test_avatars_and_covers_use_their_own_max_side(): void
    {
        [$width] = getimagesize(ImageOptimizer::optimize($this->photo(1200, 1200), ImageOptimizer::AVATAR_MAX)->getRealPath());
        $this->assertSame(512, $width);
    }

    public function test_gifs_are_left_untouched_because_they_may_be_animated(): void
    {
        $gif = $this->photo(300, 200, 'gif');
        $this->assertSame($gif, ImageOptimizer::optimize($gif));
    }

    public function test_lesson_images_uploaded_in_the_builder_are_compressed(): void
    {
        Storage::fake('public');
        $admin = User::factory()->create(['role' => 'admin']);
        $course = Course::factory()->create();

        $response = $this->actingAs($admin, 'sanctum')
            ->post("/api/admin/courses/{$course->id}/builder/upload", ['file' => $this->photo(2600, 1800)], ['Accept' => 'application/json'])
            ->assertCreated();

        $this->assertStringEndsWith('.webp', $response->json('url'));
        $asset = MediaAsset::query()->latest('id')->firstOrFail();
        $this->assertSame('image/webp', $asset->mime_type);
        [$width] = getimagesize(Storage::disk('public')->path($asset->path));
        $this->assertSame(2000, $width);
    }
}
