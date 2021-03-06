# Directions

Run it:

```bash
dropyll
  --port 8050
  --tld blogginin1999.com
  --local /www/blog-dropyll
  --dropbox /blog-jekyll
  --appkey {your app key}
  --appsecret {your app secret}
  --oauthtoken {your dropbox account token}
  --oauthsecret {your dropbox account secret}
```

All of those `{your whatever}` values should be un-quoted strings of hexadecimals.

## Back-end

Setting up:

    chown u+a nodedude /www/
    # where nodedude is who runs dropyll above

Nginx config:

    server {
      listen 80;
      server_name test.blogginin1999.com;
      index index.html;
      location / {
        root /www/blog-dropyll/_test;
      }
    }

    server {
      listen 80;
      server_name *.blogginin1999.com;
      index index.html;
      location / {
        root /www/blog-dropyll/_live;
      }
      location /dropyll {
          proxy_pass http://127.0.0.1:8050;
      }
    }

## Dependencies

- **dbox**. node-dropbox has a slightly nicer interface, but is broken
* **regex-router**. lightweight regex-based http controller routing.
* **optimist**. easy command line option parsing.

## License

Copyright © 2012–2013 Christopher Brown. [MIT Licensed](LICENSE).
