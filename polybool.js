/*
 * Implementation of the Greiner-Kai "efficient clipping of arbitrary polygons
 *
 * http://www.inf.usi.ch/hormann/papers/Greiner.1998.ECO.pdf
 */
"use strict";
var polybool = (function() {
    // Doubly linked list node for bookkeeping
    // Polygons are a circularly linked list
    function Node(vec) {
        this.vec = vec;
    }

    // Add an intersection between this point and the next one at distance alpha
    Node.prototype.addIntersection = function(alpha) {
        var new_vec = [
            this.vec[0] * (1 - alpha) + this.next.vec[0] * alpha,
            this.vec[1] * (1 - alpha) + this.next.vec[1] * alpha,
        ];
        var new_node = new Node(new_vec);
        new_node.intersect = true;
        new_node.next = this.next;
        new_node.next.prev = new_node;
        new_node.prev = this;
        this.next = new_node;
        return new_node;
    };

    // Call func over all of the nodes
    Node.prototype.forEach = function(func) {
        var current = this;
        do {
            func(current);
            current = current.next;
        } while (current !== this)
    };

    // Convert a polygon array into a linked list
    function linkedList(vecs) {
        var ret, tail;
        for (var current of vecs) {
            if (!ret) {
                tail = ret = new Node(current);
            } else {
                tail.next = new Node(current);
                tail.next.prev = tail;
                tail = tail.next;
            }
        }
        ret.prev = tail;
        tail.next = ret;
        return ret;
    }

    /*
     * The polybool function. Currently this finds the intersection of two
     * arbitrary polygons. At the moment this does not handle any degeneracies
     * (e.g. a point from one polygon lies on an edge of the other, or two
     * points from each polygon are equal. To get around this, you can randomly
     * perturb the points a bit. The input format of a polygon is a
     * counterclockwise (0, 0 is upper left) aray of points, where each point
     * is an array of [x, y].
     *
     * Currently, union and difference are also not implemented
     */
    function polybool(subject, clip) {
        var subject_l = linkedList(subject);
        var clip_l = linkedList(clip);

        var intersections = phase1(subject_l, clip_l);
        if (intersections.size > 0) { // General case
            phase2(subject_l, clip_l);
            return phase3(intersections);
        } else if (inPoly(subject_l, clip_l.vec)) {
            return [clip];
        } else if (inPoly(clip_l, subject_l.vec)) {
            return [subject];
        } else {
            return [];
        }
    }

    // Corresponds to < p - r | (q - r)T > in the paper
    // This is simple the cross product
    // IS positive if r is left of p -> q
    function wec(p, q, r) {
        return (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
    }

    // Given three colinear points p, q, r, the function checks if
    // point q lies on line segment 'pr'
    function onSegment(p, q, r) {
        return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) &&
            q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y)
    }

    // Determines if and where p1 - p2 intersects with q1 - q2
    // TODO This returns valid positions if the end point of one lies on the
    // other, but this case is not handled by the rest of the algorithm.
    function intersection(p1, p2, q1, q2) {
        var wec_p1 = wec(p1, q2, q1),
            wec_p2 = wec(p2, q2, q1),
            wec_q1 = wec(q1, p2, p1),
            wec_q2 = wec(q2, p2, p1);

        if (wec_p1 * wec_p2 <= 0 && wec_q1 * wec_q2 <= 0) {
            if ((wec_p1 === 0 && !onSegment(q1, p1, q2))
                    || (wec_p2 === 0 && !onSegment(q1, p2, q2))
                    || (wec_q1 === 0 && !onSegment(p1, q1, p2))
                    || (wec_q2 === 0 && !onSegment(p1, q2, p2)))
                return false;
            else
                return [wec_p1 / (wec_p1 - wec_p2), wec_q1 / (wec_q1 - wec_q2)];
        } else {
            return false;
        }
    }

    /* 
     * Implements phase one of the algorithm, marking up and inserting
     * intersections.
     *
     * TODO Sweep line is a better way to find intersections. This
     * implementation is O(n^2) but it could be O(n log n) with sweep line.
     * https://en.wikipedia.org/wiki/Bentley%E2%80%93Ottmann_algorithm. This
     * was not implemented because data structures are hard in javascript.
     */
    var eps = 1e-6;
    function phase1(subject, clip) {
        var intersections = new Set();

        subject.forEach(si => {
            clip.forEach(ci => {
                var alphas = intersection(si.vec, si.next.vec, ci.vec, ci.next.vec);
                if (alphas) {
                    if ((si.intersect && alphas[0] - eps < 0)
                            || (si.next.intersect && alphas[0] +  eps > 1)
                            || (ci.intersect && alphas[1] - eps < 0)
                            || (ci.next.intersect && alphas[1] +  eps > 1))
                        return;

                    var subject_new = si.addIntersection(alphas[0]),
                        clip_new = ci.addIntersection(alphas[1]);
                    subject_new.neighbor = clip_new;
                    clip_new.neighbor = subject_new;
                    intersections.add(subject_new);
                }
            });
        });
        return intersections;
    }

    /*
     * Returns true if polygon (linked list) contains point ([x, y])
     *
     * TODO for robustness this should probably determine if point lies on an
     * edge of polygon
     */
    function inPoly(polygon, point) {
        var wn = 0;
        polygon.forEach(node => {
            // TODO put a test to determine if point is on boundary and return special thing
            if (node.vec[1] <= point[1] && node.next.vec[1] > point[1] && wec(node.vec, node.next.vec, point) < 0)
                wn++;
            else if (node.vec[1] > point[1] && node.next.vec[1] <= point[1] && wec(node.vec, node.next.vec, point) > 0)
                wn--;
        });
        return wn % 2 === 1;
    }

    /*
     * Tags entry exit status of polygon relative other.
     */
    function tagEntryStatus(polygon, other) {
        var status = inPoly(other, polygon.vec) ? -1 : 1;
        polygon.forEach(node => {
            if (node.intersect) {
                node.entryExit = status;
                status = -status;
            }
        });
    }

    /*
     * Implements phase 2 of the algorithm, tagging the entry and exit status
     * of intersections
     */
    function phase2(subject, clip) {
        tagEntryStatus(subject, clip);
        tagEntryStatus(clip, subject);
    }

    /*
     * Implements phase 3 of the algorithm, stepping through intersections to
     * create polygons.
     *
     * The final polygons in array form are return. E.g. an array of an array
     * of points.
     */
    function phase3(intersections) {
        var polys = [];

        while (intersections.size > 0) {
            var poly = [];
            var start = intersections.keys().next().value;
            intersections.delete(start);

            var current = start;
            do {
                var adv = current.entryExit > 0 ? (n => n.next) : (n => n.prev);
                do {
                    poly.push(current.vec);
                    current = adv(current);
                } while (!current.intersect)
                intersections.delete(current);
                current = current.neighbor
                intersections.delete(current);
            } while (current !== start)
            if (area(poly) < 0)
                poly.reverse();
            polys.push(poly);
        }
        return polys;
    }

    /*
     * Calculates the signed area of a polygon. This is necessary to reverse
     * polygons that were found in reverse order.
     */
    function area(polygon) {
        var n = polygon.length;
        var area = 0;
        for (var i = 0; i < n; ++i) {
            var curr = polygon[i], next = polygon[(i + 1) % n];
            area += (next[0] - curr[0]) * (next[1] + curr[1]);
        }
        return area;
    }

    return polybool;
})();
