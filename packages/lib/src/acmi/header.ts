/** ACMI file identification values read from the first two lines. */
export default class Header {
  /** MIME-like ACMI file type, normally `text/acmi/tacview`. */
  public fileType: string = "";

  /** ACMI format version, such as `2.1` or `2.2`. */
  public fileVersion: string = "";
}
