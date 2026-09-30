// Read-only DRM capture for acceptance tests.
// Compile against the target sysroot; never install as a service.
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <drm/drm.h>
#include <drm/drm_mode.h>

int main(int argc, char **argv) {
  if (argc != 5 || strcmp(argv[1], "capture")) {
    fprintf(stderr, "usage: probe capture DRM-device framebuffer-id output.raw\n"); return 2;
  }
  int fd = open(argv[2], O_RDWR);
  if (fd < 0) { perror("drm open"); return 1; }
  struct drm_mode_fb_cmd fb;
  memset(&fb, 0, sizeof(fb)); fb.fb_id = atoi(argv[3]);
  if (ioctl(fd, DRM_IOCTL_MODE_GETFB, &fb)) { perror("GETFB"); return 1; }
  if (fb.bpp != 32 || fb.height > 4096 || fb.width > 4096 || fb.pitch > 16384) return 1;
  struct drm_mode_map_dumb map;
  memset(&map, 0, sizeof(map)); map.handle = fb.handle;
  if (ioctl(fd, DRM_IOCTL_MODE_MAP_DUMB, &map)) { perror("MAP_DUMB"); return 1; }
  size_t size = (size_t)fb.height * fb.pitch;
  void *pixels = mmap(NULL, size, PROT_READ, MAP_SHARED, fd, map.offset);
  if (pixels == MAP_FAILED) { perror("mmap"); return 1; }
  FILE *out = fopen(argv[4], "wb");
  if (!out || fwrite(pixels, 1, size, out) != size) return 1;
  fclose(out); munmap(pixels, size);
  struct drm_gem_close release;
  memset(&release, 0, sizeof(release)); release.handle = fb.handle;
  ioctl(fd, DRM_IOCTL_GEM_CLOSE, &release);
  close(fd);
  printf("width=%u height=%u pitch=%u bpp=%u\n", fb.width, fb.height, fb.pitch, fb.bpp);
  return 0;
}
