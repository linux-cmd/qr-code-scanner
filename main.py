import cv2

def isolate_qr_code(image_path, output_path):
    # 1. Load the image
    image = cv2.imread(image_path)
    if image is None:
        print("Error: Could not load image.")
        return

    # 2. Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # 3. Apply a binary threshold
    # This turns everything bright (like the QR code's white background) to pure white
    # and everything dark (like the app background) to pure black.
    _, thresh = cv2.threshold(gray, 120, 255, cv2.THRESH_BINARY)

    # 4. Find contours (shapes) in the thresholded image
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        print("No contours found.")
        return

    # 5. Find the largest contour by area
    # In your image, the largest bright shape is the QR code itself
    largest_contour = max(contours, key=cv2.contourArea)

    # 6. Get the bounding box coordinates for that largest contour
    x, y, w, h = cv2.boundingRect(largest_contour)

    # 7. Crop the image using array slicing [y_start:y_end, x_start:x_end]
    cropped_qr = image[y:y+h, x:x+w]

    # 8. Save the isolated QR code
    cv2.imwrite(output_path, cropped_qr)
    print(f"Success! QR code isolated and saved to {output_path}")

# Run the function
isolate_qr_code('unnamed.png', 'isolated_qr.png')