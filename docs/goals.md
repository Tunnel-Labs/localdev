# Goals

## Using the native scrollback buffer

In localdev, logs will inevitably overflow from the terminal viewport. The most intuitive way for developers to access these overflowed logs is to scroll up in their terminal window.

Here, localdev can do one of two things: it can either create its own "Scroll View" within the TUI (here, we would intercept the scroll event in the terminal and re-render the logs displayed in our custom scroll view), or it could leverage the terminal scrollback buffer by outputting overflowed logs.

In addition to requiring a substantial amount of work, re-creating our own "Scroll View" would hinder programmers who use custom programs to interact with the scrollback buffer, such as tmux (which implements features like searching and navigation using the keyboard). If possible, it would be much more optimal to simply leverage the terminal's scrollback buffer.

However, using the scrollback buffer comes with a few caveats that need to be considered. In a normal TUI program, all the rendering is done with _overwrites_, where the new output is overwritten on top of the old output using terminal escape codes. This method of rendering eliminates flickering and tearing issues inside the terminal. However, overwriting doesn't "move" output into the scrollback buffer. In order to add content to the scrollback buffer, we need to output new lines that "push" old lines outside the terminal viewport, as there is no way to directly modify the content in a terminal's scrollback buffer.

Unfortunately, "pushing" lines outside the terminal viewport causes every line that is currently displayed in the terminal to be shifted up one line. This leads to noticeable flickering issues when rendering to the terminal.

To solve this problem, we attempt to "lazily" update the scrollback buffer and only push lines when a scroll event is detected in the terminal. This way, we can keep renders flicker-free (since we'd only be using overwrites) while supporting the common use-case of scrolling up to view overflowed logs.

In order to detect terminal scroll events, we use the ANSI escape sequence `\u001B[?1003h`, which will cause mouse events to be outputted into `stdin`. When we detect a scroll event, we then update our overflowed logs and disable terminal scroll events so that the user can make full use of their terminal's native mouse and scroll event handlers. We also freeze localdev's output and add a notice saying "press any key to continue" to resume localdev.

> The motivation behind freezing localdev's output is due to the fact that we no longer can detect scroll events after disabling mouse events in the terminal. We need a way for the user to indicate that they're finished browsing through the logs and that it's safe to re-enable mouse events in the terminal, and the only way for us to do that is through a key event made by the user (which is why we prompt them to "press any key to continue"). In addition, freezing the output also makes scrolling through logs easier since the position of the logs don't change until the user is finished (at which point they press a key to resume localdev).
