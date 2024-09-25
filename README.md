# Origin

```yaml
services:
    transcoder:
        build: .
        environment:
        - TARGET=http://nginx:80
        - CACHE_PATH=/cached/
        - PORT=3001
        ports:
        - "3001:3001"
```

### Install
    
```bash
docker run -d -p 3001:3001 --name transcoder -e TARGET=http://nginx:80 -e CACHE_PATH=/cached -e PORT=3001 ghcr.io/online-video-platform/origin:main
```
