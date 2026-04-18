import React, {
  useRef,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";

// Constants for joystick size, based on viewport height (vh)
const JOYSTICK_RADIUS_VH = 7; // 7% of viewport height for joystick base radius
const THUMB_RADIUS_VH = 3.5; // 3.5% of viewport height for thumb radius

// Define the size of the fixed activation zone as a percentage of viewport
const ACTIVATION_ZONE_SIZE_PERCENT = 30; // 40% of viewport width AND height

export const Joystick = forwardRef(({ onMove }, ref, joystickOn, joyStickJump) => {

  // Ref for the *dynamic* joystick base (the one that appears and moves)
  const dynamicJoystickBaseRef = useRef();
  // Ref for the joystick's thumb
  const thumbRef = useRef();
  // Ref for the *fixed*, invisible activation zone in the corner
  const activationZoneRef = useRef();

  // State for joystick's normalized X and Y movement (from -1 to 1)
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  // State to track if a drag operation is currently active
  const [isDragging, setIsDragging] = useState(false);
  // State for the jump button
  const [isJump, setIsJump] = useState(false);


  // State for the dynamic joystick's position (viewport coordinates for its top-left corner)
  const [dynamicJoystickPos, setDynamicJoystickPos] = useState({ x: 0, y: 0 });
  // State to control the visibility of the dynamic joystick
  const [isDynamicJoystickVisible, setIsDynamicJoystickVisible] =
    useState(false);

  // Ref to store the initial touch/mouse ID for multi-touch robustness
  const activePointerId = useRef(null);

  // Refs for the calculated center of the *dynamic* joystick (used for thumb calculations)
  const dynamicJoystickCenterX = useRef(0);
  const dynamicJoystickCenterY = useRef(0);

  // Function to calculate sizes based on current viewport dimensions
  const getSizes = () => {
    const vh = window.innerHeight / 100;
    const vw = window.innerWidth / 100;

    return {
      joystickRadiusPx: JOYSTICK_RADIUS_VH * vh,
      thumbRadiusPx: THUMB_RADIUS_VH * vh,
      // Activation zone size calculated as a percentage of viewport width and height
      activationZoneWidthPx: ACTIVATION_ZONE_SIZE_PERCENT * vw,
      activationZoneHeightPx: ACTIVATION_ZONE_SIZE_PERCENT * vh,
    };
  };

  // State to store current sizes, updated on resize
  const [sizes, setSizes] = useState(getSizes());

  // Effect to handle window resize events
  useEffect(() => {
    const handleResize = () => {
      console.log("Window resized. Updating sizes.");
      setSizes(getSizes());
      // If the joystick is currently visible, recalculate its center based on new sizes
      // This is important if the joystick's position is derived from a resized viewport.
      if (isDynamicJoystickVisible && dynamicJoystickBaseRef.current) {
        const rect = dynamicJoystickBaseRef.current.getBoundingClientRect();
        dynamicJoystickCenterX.current = rect.left + rect.width / 2;
        dynamicJoystickCenterY.current = rect.top + rect.height / 2;
        console.log("Joystick visible and resized. Recalculated center.");
      }
    };
    window.addEventListener("resize", handleResize);
    // Cleanup: remove event listener when component unmounts
    return () => window.removeEventListener("resize", handleResize);
  }, [isDynamicJoystickVisible]); // Dependency: re-run if joystick visibility changes

  // Expose joystick values and reset function to parent component via ref
  useImperativeHandle(
    ref,
    () => ({
      x: x,
      y: y,
      isJump: isJump,

      getValues: () => ({ x: x, y: y, isJump: isJump }),

      reset: () => {
        if (thumbRef.current) {
          thumbRef.current.style.transform = `translate(-50%, -50%)`; // Reset thumb visual position
          setX(0); // Reset normalized X value
          setY(0); // Reset normalized Y value
          if (onMove) onMove({ x: 0, y: 0 }); // Notify parent of reset
          setIsDynamicJoystickVisible(false); // Hide the joystick
          console.log("Joystick reset and hidden.");
        }
      },
    }),
    [x, y, isJump, onMove] // Dependencies for useImperativeHandle

  );

  useEffect(() => {
    console.log("Jumping:", isJump);
  }, [isJump]);

  // Main effect for attaching and cleaning up event listeners
  useEffect(() => {
    const activationZoneElement = activationZoneRef.current;
    // Note: thumbRef.current will only be available when isDynamicJoystickVisible is true
    // Access it conditionally within event handlers.

    // Critical check: if activation zone element isn't mounted, don't proceed
    if (!activationZoneElement) {
      console.error(
        "Activation zone element not found. Is it rendered in the DOM?"
      );
      return;
    }
    // console.log("Activation zone ref successfully attached:", activationZoneElement); // Confirm ref attachment

    // Handler for initiating a drag (touch/mouse down)
    const startDrag = (e, clientX, clientY, pointerId = null) => {
      // Prevent default browser actions (scrolling, zooming, text selection)
      e.preventDefault();
      // Stop event from bubbling up to higher-level elements (like camera controls)
      e.stopPropagation();

      console.log("startDrag triggered!");
      // If a drag is already in progress, ignore subsequent start events
      if (isDragging) {
        console.log("Already dragging, ignoring new startDrag.");
        return;
      }

      setIsDragging(true); // Set dragging state to true
      setIsDynamicJoystickVisible(true); // Make the dynamic joystick visible
      activePointerId.current = pointerId; // Store pointer ID for multi-touch tracking

      const { joystickRadiusPx } = sizes; // Get current joystick radius from state

      const zoneRect = activationZoneElement.getBoundingClientRect(); // Get dimensions of the activation zone
      console.log("Activation Zone Rect:", zoneRect);

      let newX = clientX; // Initial X position for joystick center
      let newY = clientY; // Initial Y position for joystick center

      // Clamp the joystick's initial center X position to stay within the activation zone's X bounds
      newX = Math.max(zoneRect.left + joystickRadiusPx, newX);
      newX = Math.min(zoneRect.right - joystickRadiusPx, newX);

      // Clamp the joystick's initial center Y position to stay within the activation zone's Y bounds
      newY = Math.max(zoneRect.top + joystickRadiusPx, newY);
      newY = Math.min(zoneRect.bottom - joystickRadiusPx, newY);

      // Set the dynamic joystick's top/left style position (its top-left corner)
      setDynamicJoystickPos({
        x: newX - joystickRadiusPx,
        y: newY - joystickRadiusPx,
      });

      // Store the actual center point for thumb movement calculations
      dynamicJoystickCenterX.current = newX;
      dynamicJoystickCenterY.current = newY;

      console.log(
        `Joystick will attempt to appear at top-left: (${
          newX - joystickRadiusPx
        }px, ${newY - joystickRadiusPx}px)`
      );
      console.log(
        `Dynamic Joystick Center set to: (${dynamicJoystickCenterX.current}, ${dynamicJoystickCenterY.current})`
      );

      // Immediately move the thumb to the initial touch/click point
      moveThumb(clientX, clientY);
    };

    // Handler for dragging (touch/mouse move)
    const duringDrag = (e, clientX, clientY) => {
      if (!isDragging) return; // Only process if currently dragging
      e.preventDefault(); // Prevent default browser actions
      e.stopPropagation(); // Stop event from bubbling up
      // console.log("duringDrag triggered!"); // Uncomment for detailed debug, can be very noisy

      moveThumb(clientX, clientY); // Move the thumb based on current pointer position
    };

    // Handler for ending a drag (touch/mouse up/cancel)
    const endDrag = (e, pointerId = null) => {
      if (!isDragging) return; // Only process if currently dragging
      // Check if event object exists before accessing its methods
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      console.log("endDrag triggered!");

      // If the pointer ID matches the active one (or is null for mouse events)
      if (
        activePointerId.current === null ||
        activePointerId.current === pointerId
      ) {
        setIsDragging(false); // End dragging state
        setIsDynamicJoystickVisible(false); // Hide the joystick
        activePointerId.current = null; // Clear active pointer ID

        // Reset thumb's visual position to center if thumbRef is available
        if (thumbRef.current) {
          thumbRef.current.style.transform = `translate(-50%, -50%)`;
        }
        setX(0); // Reset normalized X value
        setY(0); // Reset normalized Y value
        if (onMove) onMove({ x: 0, y: 0 }); // Notify parent of reset
        console.log("Joystick hidden and reset.");
      }
    };

    // --- Touch Event Handlers for the ACTIVATION ZONE ---
    const handleTouchStart = (e) => {
      // Only initiate if not already dragging and only for a single touch (to avoid multi-touch issues)
      if (!isDragging && e.touches.length === 1) {
        startDrag(
          e,
          e.touches[0].clientX,
          e.touches[0].clientY,
          e.touches[0].identifier
        );
      }
    };

    // --- Mouse Event Handlers for the ACTIVATION ZONE ---
    const handleMouseDown = (e) => {
      // Only initiate if not already dragging and it's a left mouse button click (button 0)
      if (!isDragging && e.button === 0) {
        startDrag(e, e.clientX, e.clientY, null); // Pointer ID is null for mouse events
      }
    };

    // --- Global Event Handlers for Dragging (attached to window/document) ---
    // These must be on `window` to allow dragging to continue even if the pointer
    // moves outside the initial activation zone or joystick's visual bounds.
    const handleTouchMove = (e) => {
      if (!isDragging) return; // Only process if a drag is active
      const activeTouch = Array.from(e.touches).find(
        (touch) => touch.identifier === activePointerId.current
      );
      if (activeTouch) {
        duringDrag(e, activeTouch.clientX, activeTouch.clientY);
      }
    };

    const handleTouchEnd = (e) => {
      if (!isDragging) return; // Only process if a drag is active
      const endedTouch = Array.from(e.changedTouches).find(
        (touch) => touch.identifier === activePointerId.current
      );
      if (endedTouch) {
        endDrag(e, endedTouch.identifier);
      } else if (e.touches.length === 0) {
        // Fallback for cases where a touch ends but its ID wasn't explicitly tracked (e.g., all touches lifted)
        endDrag(e);
      }
    };

    const handleTouchCancel = (e) => {
      if (!isDragging) return; // Only process if a drag is active
      const cancelledTouch = Array.from(e.changedTouches).find(
        (touch) => touch.identifier === activePointerId.current
      );
      if (cancelledTouch) {
        endDrag(e, cancelledTouch.identifier); // Treat a touch cancel like an end
      } else if (e.touches.length === 0 && isDragging) {
        endDrag(e);
      }
    };

    const handleMouseMove = (e) => {
      if (!isDragging) return; // Only process if a drag is active
      duringDrag(e, e.clientX, e.clientY);
    };

    const handleMouseUp = (e) => {
      if (!isDragging) return; // Only process if a drag is active
      endDrag(e, null);
    };

    // Attach `start` listeners directly to the fixed activation zone element
    activationZoneElement.addEventListener("touchstart", handleTouchStart, {
      passive: false,
    });
    activationZoneElement.addEventListener("mousedown", handleMouseDown);

    // Attach `move` and `end` listeners to the `window` for global tracking
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchCancel);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    // Cleanup function: remove all event listeners when the component unmounts
    return () => {
      console.log("Cleaning up event listeners.");
      activationZoneElement.removeEventListener("touchstart", handleTouchStart);
      activationZoneElement.removeEventListener("mousedown", handleMouseDown);

      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchCancel);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, onMove, sizes]); // Dependencies: re-run effect if these states/props change

  // Function to move the joystick thumb based on pointer position
  const moveThumb = (clientX, clientY) => {
    // If thumb ref is not yet available, or joystick radius is zero, exit
    if (!thumbRef.current) {
      console.warn(
        "Thumb ref not available for moveThumb. This might happen on first render before joystick is visible."
      );
      return;
    }
    const { joystickRadiusPx } = sizes;
    if (!joystickRadiusPx || joystickRadiusPx === 0) {
      console.warn("joystickRadiusPx is zero or null, cannot move thumb.");
      return;
    }

    // Calculate delta from the dynamic joystick's center to the current pointer position
    const deltaX = clientX - dynamicJoystickCenterX.current;
    const deltaY = clientY - dynamicJoystickCenterY.current;

    // Calculate the distance from the center, clamping it to the joystick's radius
    const distance = Math.min(
      joystickRadiusPx,
      Math.sqrt(deltaX * deltaX + deltaY * deltaY)
    );
    // Calculate the angle of the pointer relative to the center
    const angle = Math.atan2(deltaY, deltaX);

    // Calculate the new X and Y positions for the thumb within the joystick
    const thumbX = distance * Math.cos(angle);
    const thumbY = distance * Math.sin(angle);

    // Apply the transform to the thumb's style to move it
    thumbRef.current.style.transform = `translate(calc(-50% + ${thumbX}px), calc(-50% + ${thumbY}px))`;

    // Update normalized X and Y values (from -1 to 1) and notify parent
    setX(thumbX / joystickRadiusPx);
    setY(thumbY / joystickRadiusPx);

    if (onMove)
      onMove({ x: thumbX / joystickRadiusPx, y: thumbY / joystickRadiusPx });
  };

  return (
  <>
    {/* The Fixed Activation Zone */}
    <div
      ref={activationZoneRef}
      style={{
        position: "fixed",
        bottom: "0px",
        left: "0px",
        width: `${sizes.activationZoneWidthPx}px`,
        height: `${sizes.activationZoneHeightPx}px`,
        backgroundColor: "transparent",
        border: "none",
        zIndex: 999,
        touchAction: "none",
        userSelect: "none",
      }}
    />

    {/* The Dynamic Joystick */}
    {isDynamicJoystickVisible && (
      <div
        ref={dynamicJoystickBaseRef}
        style={{
          position: "fixed",
          top: `${dynamicJoystickPos.y}px`,
          left: `${dynamicJoystickPos.x}px`,
          width: `${sizes.joystickRadiusPx * 2}px`,
          height: `${sizes.joystickRadiusPx * 2}px`,
          borderRadius: "50%",
          backgroundColor: "rgba(255, 255, 255, 0.3)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1000,
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <div
          ref={thumbRef}
          style={{
            width: `${sizes.thumbRadiusPx * 2}px`,
            height: `${sizes.thumbRadiusPx * 2}px`,
            borderRadius: "50%",
            backgroundColor: "rgba(255, 255, 255, 0.7)",
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        />
      </div>
    )}

    {/* 👇 Jump Button goes here */}
    <button
      onMouseDown={() => setIsJump(true)}
      onMouseUp={() => setIsJump(false)}
      onTouchStart={() => setIsJump(true)}
      onTouchEnd={() => setIsJump(false)}
      style={{
        position: "fixed",
        bottom: "50px",
        right: "50px",
        width: "80px",
        height: "80px",
        borderRadius: "50%",
        backgroundColor: "rgba(255, 255, 255, 0.7)",
        border: "2px solid white",
        fontSize: "18px",
        zIndex: 1001,
        touchAction: "none",
        userSelect: "none",
      }}
    >
      Jump
    </button>
  </>
);
});
