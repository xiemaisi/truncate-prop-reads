truncate-prop-reads
===================

Create a set of property completion problems from a given JavaScript program by truncating it at all property reads.

There are two ways of invoking the truncator: on an HTML file, and on a set of JavaScript files.

In the former case, the invocation looks like this:

      node truncate.js foo.html outdir

The truncator will go through all the property read expressions in all the scripts included in `foo.html`. For each property read `x.f` in some script `script.js`, it creates a copy of `foo.html` that includes all of the original scripts, except for `script.js`, instead of which it includes a truncated version that contains the property read expression `x.$$f`. All the generated HTML and JavaScript files are written to directory `outdir`.

To truncate a set of JavaScript files, invoke the truncator like this:

      node truncate.js f1.js f2.js ... outdir

In this case, the JavaScript files are truncated as above, but instead of generating variant HTML files, the truncator generates subdirectories of `outdir`, which contain all the JavaScript files, with one of them being truncated at some property read.