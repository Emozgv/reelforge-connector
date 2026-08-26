const RAIL_GRADIENTS = [
  "linear-gradient(160deg,#3a3140,#221d29)",
  "linear-gradient(160deg,#2f3a3a,#1b2222)",
  "linear-gradient(160deg,#3a3128,#241f1a)",
  "linear-gradient(160deg,#2c3140,#1a1d29)",
  "linear-gradient(160deg,#3a2c37,#231b23)",
  "linear-gradient(160deg,#2e3a34,#1a221f)",
];

// Fixed, purely decorative set of real reel thumbnail images — not tied to
// Discovery, Collections, or any other live data. Just here so the hero
// rails visually read as "real reels" instead of abstract gradient tiles.
// A URL going stale over time is fine (the <img> below hides itself on
// error and the gradient tile underneath still shows).
const RAIL_IMAGES = [
  "https://scontent-iad3-1.cdninstagram.com/v/t51.82787-15/755948731_18598230331018626_5802978834069229030_n.jpg?stp=dst-jpg_e15_p480x480_tt6&_nc_cat=1&ig_cache_key=Mzk1MTU5MzQyODA3MzU0ODE4ODE4NTk4MjMwMzI1MDE4NjI2.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNMSVBTLnhwaWRzLjEwODAuc2RyLnZpZGVvX2RlZmF1bHRfY292ZXJfZnJhbWUuQzMifQ%3D%3D&_nc_ohc=GZb1aww2pqgQ7kNvwHbry6s&_nc_oc=AdrVsjhV7PnAGAPl-43qZ37SSuvPvVD7nPjJEmyK2shinEAAkniJNOEb-gUyyCwNITg&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-iad3-1.cdninstagram.com&_nc_gid=Thtru-7i2AicsnMxf6Qumg&_nc_ss=7a3ba&oh=00_AQFID1aMS-3vuRxLjOF7GN7drWqnmZx4Zd-UmCBFJRk2YA&oe=6A920559",
  "https://scontent-iad6-1.cdninstagram.com/v/t51.71878-15/707739630_840473865349929_6237872239306517603_n.jpg?stp=dst-jpg_e15_p480x480_tt6&_nc_cat=109&ig_cache_key=MzkwNjMyNTI4MzY0MjQ4OTA4MTE3MDU2MTEzMjcyOTE3MzU%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNMSVBTLnhwaWRzLjY0MC5zZHIudmlkZW9fbmZyYW1lX2NvdmVyX2ZyYW1lLkMzIn0%3D&_nc_ohc=eED6CEdWT-QQ7kNvwESdVgc&_nc_oc=AdoRdIUBQxPHy-XJmG1fil0FwlwR1jRntC4z7gTNNPyGx_QR6AO3Im_bDaEBQ9IgQfo&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-iad6-1.cdninstagram.com&_nc_gid=Thtru-7i2AicsnMxf6Qumg&_nc_ss=7a3ba&oh=00_AQFZie6t99r8icFBRbegLrB5qzZQ5WAaXShUdLU7t-4aOQ&oe=6A921AC5",
  "https://scontent-iad3-2.cdninstagram.com/v/t51.71878-15/710573050_1316203897373758_1744262715989600085_n.jpg?stp=dst-jpg_e15_p480x480_tt6&_nc_cat=105&ig_cache_key=MzkwODQwODYwMzA3NzMzNDI2NDE3NzI3MjM0MzA4MDc2ODY%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNMSVBTLnhwaWRzLjY0MC5zZHIudmlkZW9fbmZyYW1lX2NvdmVyX2ZyYW1lLkMzIn0%3D&_nc_ohc=VfFzM2BcySgQ7kNvwFTCssr&_nc_oc=AdqXm3QP5tH_hf-EqsR3LK8PHkP1KbnbBRo8_0NdnjTm2Igj5B3x24KeEf49b_4Abbc&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-iad3-2.cdninstagram.com&_nc_gid=Thtru-7i2AicsnMxf6Qumg&_nc_ss=7a3ba&oh=00_AQEgtEf1eJ33T5wYG_CywpnMer-udwNr7oxm6L4_jlEEmQ&oe=6A920947",
  "https://scontent-iad6-1.cdninstagram.com/v/t51.82787-15/715516354_18738745930056421_8767290870649359732_n.jpg?stp=dst-jpg_e15_p480x480_tt6&_nc_cat=102&ig_cache_key=MzkxMjE4NjQ4OTc5MjUzMjc1NjE4NzM4NzQ1OTI0MDU2NDIx.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNMSVBTLnhwaWRzLjEwODAuc2RyLnZpZGVvX2RlZmF1bHRfY292ZXJfZnJhbWUuQzMifQ%3D%3D&_nc_ohc=iN4YSeDFGvYQ7kNvwHWNene&_nc_oc=AdohmT-6_YBmOFkmkXo0cmxTxePUyX7oHBSC6wlYF0Y8qvPFppUbtCtAfX9ZTebf3bE&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-iad6-1.cdninstagram.com&_nc_gid=Thtru-7i2AicsnMxf6Qumg&_nc_ss=7a3ba&oh=00_AQHRTnaQJ3hjTl1aIfRWqA_17TaY92FBv-xRWutZrwligA&oe=6A922117",
  "https://scontent-iad3-2.cdninstagram.com/v/t51.71878-15/717675750_1397357498895712_2603689595425775737_n.jpg?stp=dst-jpg_e15_p480x480_tt6&_nc_cat=103&ig_cache_key=MzkxMzAxMjQxMDAxMjg2ODQxNDE3ODA3NTg1NTMyOTg4MzQ%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNMSVBTLnhwaWRzLjY0MC5zZHIudmlkZW9fbmZyYW1lX2NvdmVyX2ZyYW1lLkMzIn0%3D&_nc_ohc=YPKcVHY7FooQ7kNvwH3GfIm&_nc_oc=Adqzvfviu7qkhHTGCvQwlaQj0cWOaIYsCNCtN2wbRCBpDmRtcjPhNraJQRipZY1_T4Q&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-iad3-2.cdninstagram.com&_nc_gid=Thtru-7i2AicsnMxf6Qumg&_nc_ss=7a3ba&oh=00_AQGuz7H-3g7Nh-iaGhxRas8mE9MuP1_bOzgTwFcU4Acz5A&oe=6A922896",
  "https://scontent-iad3-1.cdninstagram.com/v/t51.82787-15/730475969_18608185318016159_1358384897120211657_n.jpg?stp=dst-jpg_e15_p480x480_tt6&_nc_cat=1&ig_cache_key=MzkzMjQzMzk1MTY2MjAzNzMzODE4NjA4MTg1MzE1MDE2MTU5.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNMSVBTLnhwaWRzLjEwODMuc2RyLnZpZGVvX2RlZmF1bHRfY292ZXJfZnJhbWUuQzMifQ%3D%3D&_nc_ohc=ZAs8kxbLZ6YQ7kNvwG3Qk98&_nc_oc=AdoHY3q0DDPWzB2wCXJ1TByGWKSazpTM5UtWVBVrkROZJPnPYF5JJsv5wmgS_r5EX0w&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-iad3-1.cdninstagram.com&_nc_gid=Thtru-7i2AicsnMxf6Qumg&_nc_ss=7a3ba&oh=00_AQEFfV56jgnjB9TD_c153mW-Jx08nM6EXuZ-SohSodaqag&oe=6A921FB3",
  "https://scontent-iad3-1.cdninstagram.com/v/t51.82787-15/735415699_18606606883054533_8185581534148167588_n.jpg?stp=dst-jpg_e15_p480x480_tt6&_nc_cat=1&ig_cache_key=MzkzNDc4NDc3MzUwMTc1MjQyMjE4NjA2NjA2ODgwMDU0NTMz.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNMSVBTLnhwaWRzLjEyMTUuc2RyLnZpZGVvX2RlZmF1bHRfY292ZXJfZnJhbWUuQzMifQ%3D%3D&_nc_ohc=6D-4jSsj-fkQ7kNvwFmm7qS&_nc_oc=Adr_TiRmXKmIkKRjysjUTN36ehztIFELS0_ohzSrEAcnq7W_FZ3dzKt2oV_nNZpa_ow&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-iad3-1.cdninstagram.com&_nc_gid=Thtru-7i2AicsnMxf6Qumg&_nc_ss=7a3ba&oh=00_AQFD_y_iS-Jex6nwZ4iTfWvSnw9h2YBFz56svww1N7EnGg&oe=6A91FE49",
  "https://scontent-iad3-1.cdninstagram.com/v/t51.82787-15/751764543_18594728758066587_7348992677353409122_n.jpg?stp=dst-jpg_e15_p480x480_tt6&_nc_cat=1&ig_cache_key=Mzk0NDcyMzMxMDEyNDgxODM4MDE4NTk0NzI4NzUyMDY2NTg3.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNMSVBTLnhwaWRzLjcyMC5zZHIudmlkZW9fZGVmYXVsdF9jb3Zlcl9mcmFtZS5DMyJ9&_nc_ohc=yesk9hMriJEQ7kNvwE-KnTT&_nc_oc=Adp2AiXvFK0L0C9gY2eUwYbOTK6azuChpn-xxoO9HhnVuc41xufzI3L6BLQmN3gZqq8&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-iad3-1.cdninstagram.com&_nc_gid=Thtru-7i2AicsnMxf6Qumg&_nc_ss=7a3ba&oh=00_AQHfXenFkf26DpsjlPOq34QX7ypY8JcsEa51gk3vDiODlA&oe=6A91FDBD",
];

function Column({
  offset,
  duration,
  reverse,
}: {
  offset: number;
  duration: number;
  reverse?: boolean;
}) {
  const tiles = [...RAIL_GRADIENTS.slice(offset), ...RAIL_GRADIENTS.slice(0, offset)];
  const loop = [...tiles, ...tiles];

  return (
    <div className="relative w-11 h-full overflow-hidden">
      <div
        className="rail-track absolute inset-x-0 top-0 flex flex-col gap-3"
        style={{
          animation: `rail-scroll ${duration}s linear infinite`,
          animationDirection: reverse ? "reverse" : "normal",
        }}
      >
        {loop.map((g, i) => {
          const src = RAIL_IMAGES[(offset + i) % RAIL_IMAGES.length];
          return (
            <div
              key={i}
              className="w-11 aspect-[9/16] rounded-lg border border-white/[0.06] shrink-0 overflow-hidden"
              style={{ background: g }}
            >
              <img
                src={src}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Purely decorative, ambient motion flanking the hero — masked so it fades
 * both toward the outer screen edge and toward the center search column.
 * Never intercepts pointer events; hidden below the desktop breakpoint.
 */
export function HeroReelRails() {
  const maskStyle = {
    WebkitMaskImage:
      "radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 85%)",
    maskImage: "radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 85%)",
  };

  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden>
      <div
        className="absolute left-2 xl:left-6 2xl:left-10 top-0 bottom-0 flex items-center gap-3 xl:gap-4 opacity-[0.35]"
        style={maskStyle}
      >
        <Column offset={0} duration={36} />
        <Column offset={2} duration={44} reverse />
        <div className="hidden 2xl:block">
          <Column offset={3} duration={38} />
        </div>
      </div>
      <div
        className="absolute right-2 xl:right-6 2xl:right-10 top-0 bottom-0 flex items-center gap-3 xl:gap-4 opacity-[0.35]"
        style={maskStyle}
      >
        <div className="hidden 2xl:block">
          <Column offset={5} duration={42} reverse />
        </div>
        <Column offset={4} duration={40} reverse />
        <Column offset={1} duration={32} />
      </div>
    </div>
  );
}
