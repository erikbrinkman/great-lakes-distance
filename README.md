# great-lakes-distance
A D3 visualization of the farthest you can be from the great lakes in any state.

This started as a way to verify if the farthest you can be from the great lakes
anywhere in Michigan is 82 miles. (I calculate 95, but there are some
approximations, and my data isn't perfect). You can see the result
[here](https://erikbrinkman.github.io/great-lakes-distance/). The color of a
state corresponds to the maximum distance you can be from the great lakes. My
mousing over a state you can see the distance to the nearest mile, and the
location in the state that's the farthest away.

This repository also contains a javascript function for doing arbitrary complex
polygon intersection client-side, and only depends on underscore. Ideally I'll
get the complexity down to `O(n log n)` and add union and difference, before
moving it to it's own repo / cdn.
